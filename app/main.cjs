'use strict';
const {app,BrowserWindow,ipcMain,Tray,Menu,Notification,nativeImage,dialog,shell,protocol,net,powerMonitor,globalShortcut}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {randomUUID}=require('node:crypto');
const {Store,validateBackup,clean,today,dueReminders,setBudget,COLLECTIONS}=require('./core.cjs');
const {parseTransactions}=require('./finance.cjs');
const {createUpdates}=require('./updates.cjs');
const APP_ID='br.local.orbita.organizador';
const testMode=process.env.ORBITA_TEST==='1';
app.setName('Órbita');
app.setAppUserModelId(APP_ID);
app.setPath('userData',process.env.ORBITA_DATA_DIR || path.join(app.getPath('appData'),'Orbita'));
fs.mkdirSync(app.getPath('userData'),{recursive:true});
protocol.registerSchemesAsPrivileged([{scheme:'orbita',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
let win,tray,store,quitting=false,closeHint=false;
let updates, quickCapture = false;
let lastMaintenanceDay;
const icon=path.join(__dirname,'../assets/icon.png');
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance',()=>show());
  app.on('before-quit',()=>{quitting=true;globalShortcut.unregisterAll();});
  app.on('before-quit-for-update',()=>{quitting=true;});
  app.on('window-all-closed',()=>{if(!tray)app.quit();});
  app.whenReady().then(async()=>{
    try {store=new Store(app.getPath('userData'));}
    catch(e){dialog.showErrorBox('Órbita • dados preservados',e.message+'\n\nPasta: '+app.getPath('userData'));app.quit();return;}
    protocol.handle('orbita',request=>{
      const url=new URL(request.url);
      if(url.hostname!=='app')return new Response('Não encontrado',{status:404});
      const allowed=['/index.html','/styles.css','/dates.js','/renderer.js','/editor.js','/organizer.js','/actions.js'];
      if(!allowed.includes(url.pathname))return new Response('Não encontrado',{status:404});
      return net.fetch(pathToFileURL(path.join(__dirname,url.pathname.slice(1))).toString());
    });
    Menu.setApplicationMenu(null);
    win=new BrowserWindow({width:1330,height:890,minWidth:1000,minHeight:720,title:'Órbita • Organizador pessoal',icon,backgroundColor:'#f4f6f5',show:false,autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,spellcheck:false}});
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.webContents.on('will-navigate',(e,url)=>{if(url!=='orbita://app/index.html')e.preventDefault();});
    win.webContents.session.setPermissionRequestHandler((_wc,_p,cb)=>cb(false));
    win.webContents.session.setPermissionCheckHandler(()=>false);
    win.once('ready-to-show',()=>{if(!process.argv.includes('--background'))show();});
    win.on('close',event=>{
      if(!quitting && store.data.settings.closeToTray && tray){event.preventDefault();win.hide();if(!closeHint){notify('Órbita continua aberto','Seus lembretes continuam ativos. Use o ícone perto do relógio para abrir ou sair.');closeHint=true;}}
    });
    if(!testMode){
      tray=new Tray(nativeImage.createFromPath(icon).resize({width:24,height:24}));
      tray.setToolTip('Órbita • Seu dia, no seu ritmo');
      tray.setContextMenu(Menu.buildFromTemplate([{label:'Abrir Órbita',click:()=>show()},{label:'Capturar tarefa',click:captureTask},{type:'separator'},{label:'Sair do Órbita',click:()=>{quitting=true;app.quit();}}]));
      tray.on('double-click',()=>show());
      tray.on('click',()=>show());
      quickCapture = globalShortcut.register('CommandOrControl+Shift+Space', captureTask);
    }
    if (app.isPackaged && !testMode && process.platform === 'win32' && fs.existsSync(path.join(process.resourcesPath, 'app-update.yml'))) {
      updates = createUpdates(state => {
        if (win && !win.isDestroyed()) win.webContents.send('update-state', state);
      });
    }
    registerIPC();
    await win.loadURL('orbita://app/index.html');
    if(store.recovered)win.webContents.send('changed',{message:'Os dados foram recuperados da cópia de segurança. O arquivo danificado foi preservado.'});
    setInterval(tick,1000).unref();
    powerMonitor.on('resume',tick);
    tick();
    if (updates && store.data.settings.checkForUpdates) setTimeout(() => void updates.check(), 3000).unref();
  }).catch(error=>{dialog.showErrorBox('Não foi possível abrir o Órbita',error.message);app.quit();});
}
function show(){if(!win)return;if(win.isMinimized())win.restore();win.show();win.focus();}
function captureTask() {
  show();
  if (win && !win.isDestroyed()) win.webContents.send('quick-capture');
}
function changed(message=''){if(win&&!win.isDestroyed())win.webContents.send('changed',{message});}
function startupEnabled(){
  if(testMode||!app.isPackaged)return false;
  // Electron's openAtLogin/args comparison drops --switches on Windows.
  // Read the actual enabled entry for this executable instead.
  const login=app.getLoginItemSettings({path:process.execPath});
  return login.executableWillLaunchAtLogin && login.launchItems.some(item=>item.name==='Orbita'&&item.enabled);
}
function snapshot(){return {...store.data,runtime:{version:app.getVersion(),packaged:app.isPackaged,dataPath:app.getPath('userData'),startup:startupEnabled(),quickCapture,update:updates?.state() || {status:'unavailable'}}};}
function notify(title,body){
  if(testMode){changed(`Lembrete: ${title}`);return;}
  if(store.data.settings.notifications && Notification.isSupported()){
    const n=new Notification({title,body,icon,timeoutType:'default'});n.on('click',()=>show());n.show();
  }
}
let lastReminderCheck=0;
function tick(){
  try{
    const day = today();
    if (lastMaintenanceDay !== day) {
      if (store.repeatTransactions(day)) changed();
      try { store.dailyBackup(day); }
      catch (error) { console.error('Falha no backup automático:', error.message); changed('O backup automático falhou. Confira a pasta de dados.'); }
      lastMaintenanceDay = day;
    }
    const f=store.data.focus;
    if(f?.status==='running' && f.endsAt<=Date.now()){
      store.change(data=>{const x=data.focus;data.sessions.push({id:randomUUID(),title:x.title||'Sessão de foco',minutes:x.minutes,date:today(),createdAt:new Date().toISOString(),projectId:x.projectId||'',taskId:x.taskId||''});data.focus=null;});
      notify('Tempo de foco concluído','Bom trabalho! Faça uma pausa antes da próxima sessão.');changed('Sessão concluída e registrada.');
    }
    if(Date.now()-lastReminderCheck>=15000){
      lastReminderCheck=Date.now();
      if(!store.data.settings.notifications)return;
      const due=dueReminders(store.data);
      if(due.length){
        store.change(data=>{for(const {kind,item} of due)data[kind].find(x=>x.id===item.id).notifiedAt=new Date().toISOString();});
        if(due.length>3)notify(`${due.length} lembretes no Órbita`,'Abra o aplicativo para conferir suas tarefas e compromissos.');
        else for(const {kind,item} of due)notify(kind==='tasks'?'Hora da tarefa':'Compromisso agora',item.title);
        changed();
      }
    }
  }catch(error){console.error('Falha no lembrete:',error.message);}
}
function registerIPC(){
  function handle(channel,fn){ipcMain.handle(channel,async(event,...args)=>{
    if(event.senderFrame?.url!=='orbita://app/index.html')throw new Error('Origem não permitida.');
    try{return {ok:true,value:await fn(...args)};}catch(error){return {ok:false,error:error.message};}
  });}
  handle('read',()=>snapshot());
  handle('upsert',(kind,item)=>{store.upsert(kind,item);if(kind==='transactions')store.repeatTransactions();return snapshot();});
  handle('remove',(kind,id)=>{store.remove(kind,id);return snapshot();});
  handle('restore-item',(kind,id)=>{store.restore(kind,id);if(kind==='transactions')store.repeatTransactions();return snapshot();});
  handle('priority',(id,day)=>{store.prioritize(id,day);return snapshot();});
  handle('habit-check',(id,date)=>{store.checkHabit(id,date);return snapshot();});
  handle('budget',(category,amount)=>{store.change(data=>setBudget(data,category,amount));return snapshot();});
  handle('settings',settings=>{
    store.change(data=>{
      if(typeof settings.name==='string')data.settings.name=settings.name.trim().slice(0,60);
      for(const key of ['dark','closeToTray','notifications','automaticBackups','checkForUpdates']){
        if(typeof settings[key]==='boolean')data.settings[key]=settings[key];
      }
    });
    if (settings.automaticBackups === true) {
      try { store.dailyBackup(); } catch (error) { changed('O backup automático falhou. Confira a pasta de dados.'); }
    }
    return snapshot();
  });
  handle('startup',enabled=>{
    if(!app.isPackaged || testMode)throw new Error('Instale o Órbita para ativar a inicialização com o Windows.');
    app.setLoginItemSettings({openAtLogin:!!enabled,path:process.execPath,args:['--background'],name:'Orbita',enabled:true});
    return snapshot();
  });
  handle('focus',(action,options={})=>{
    store.change(data=>{
      if(action==='start'){
        if(data.focus)throw new Error('Pause ou encerre a sessão atual antes de iniciar outra.');
        const minutes=Number(options.minutes);if(!Number.isInteger(minutes)||minutes<1||minutes>240)throw new Error('Escolha entre 1 e 240 minutos.');
        const task = options.taskId ? data.tasks.find(item => item.id === options.taskId) : null;
        if (options.taskId && !task) throw new Error('A tarefa não está mais disponível.');
        data.focus={title:String(task?.title||options.title||'Sessão de foco').slice(0,200),minutes,remaining:minutes*60,endsAt:Date.now()+minutes*60000,status:'running',taskId:task?.id||'',projectId:task?.projectId||''};
      }else if(action==='pause' && data.focus?.status==='running'){
        data.focus.remaining=Math.max(0,Math.ceil((data.focus.endsAt-Date.now())/1000));data.focus.endsAt=null;data.focus.status='paused';
      }else if(action==='resume' && data.focus?.status==='paused'){
        data.focus.endsAt=Date.now()+data.focus.remaining*1000;data.focus.status='running';
      }else if(action==='reset')data.focus=null;
      else throw new Error('Ação de foco inválida.');
    });return snapshot();
  });
  handle('export',async()=>{
    const {canceled,filePath}=await dialog.showSaveDialog(win,{title:'Salvar backup do Órbita',defaultPath:`Orbita-backup-${today()}.json`,filters:[{name:'Backup Órbita',extensions:['json']}]});
    if(canceled)return false;
    fs.writeFileSync(filePath,JSON.stringify(store.data,null,2),'utf8');return true;
  });
  handle('import',async()=>{
    const {canceled,filePaths}=await dialog.showOpenDialog(win,{title:'Restaurar backup do Órbita',properties:['openFile'],filters:[{name:'Backup Órbita',extensions:['json']}]});
    if(canceled)return false;
    return restoreFromFile(filePaths[0]);
  });
  handle('backups',()=>store.backups());
  handle('restore-daily',name=>{
    if(!store.backups().includes(name))throw new Error('Backup não encontrado.');
    return restoreFromFile(path.join(store.dir,'backups',name));
  });
  handle('import-csv',async()=>{
    const file=await dialog.showOpenDialog(win,{title:'Importar lançamentos CSV',properties:['openFile'],filters:[{name:'CSV',extensions:['csv']}]});
    if(file.canceled)return false;
    if(fs.statSync(file.filePaths[0]).size>5*1024*1024)throw new Error('O CSV excede 5 MB.');
    const rows=parseTransactions(fs.readFileSync(file.filePaths[0],'utf8'));
    rows.forEach((row,index)=>{
      try { clean('transactions',row); }
      catch(error){ throw new Error(`Lançamento ${index+1}: ${error.message}`); }
    });
    const {response}=await dialog.showMessageBox(win,{
      type:'question',message:`Importar ${rows.length} lançamento(s)?`,
      detail:'Os lançamentos serão adicionados aos que você já tem. Confira se o arquivo ainda não foi importado.',
      buttons:['Cancelar','Importar CSV'],defaultId:0,cancelId:0
    });
    if(response!==1)return false;
    store.importTransactions(rows);
    return snapshot();
  });
  handle('update',async action=>{
    if(!updates)throw new Error('Atualizações disponíveis no aplicativo instalado.');
    if(action==='check')await updates.check();
    if(action==='download')await updates.download();
    if(action==='install'&&updates.state().status==='ready'){
      const {response}=await dialog.showMessageBox(win,{
        type:'question',message:`Instalar o Órbita ${updates.state().version}?`,
        detail:'O aplicativo será fechado e aberto novamente.',
        buttons:['Agora não','Instalar e reiniciar'],defaultId:0,cancelId:0
      });
      if(response===1){quitting=true;updates.install();}
    }
    return updates.state();
  });
  handle('data-folder',()=>shell.openPath(app.getPath('userData')));
  handle('notification-test',()=>{notify('Órbita está pronto','Os lembretes aparecerão aqui enquanto o aplicativo estiver aberto, inclusive na bandeja.');return true;});
  handle('quit',()=>{quitting=true;setTimeout(()=>app.quit(),50);return true;});
}

async function restoreFromFile(file) {
  if(fs.statSync(file).size>20*1024*1024)throw new Error('O arquivo excede o limite de 20 MB.');
  const restored=validateBackup(JSON.parse(fs.readFileSync(file,'utf8')));
  const labels=['Tarefas','Compromissos','Projetos','Metas','Hábitos','Lançamentos','Notas','Sessões de foco'];
  const counts=COLLECTIONS.map((kind,index)=>`${labels[index]}: ${restored[kind].length}`).join(' · ');
  const {response}=await dialog.showMessageBox(win,{
    type:'warning',title:'Restaurar backup?',message:'Os dados atuais serão substituídos pelos dados do backup.',
    detail:`${path.basename(file)}\n${counts}\nLixeira: ${restored.trash.length}\n\nUma cópia dos dados atuais será preservada. A sessão de foco será interrompida.`,
    buttons:['Cancelar','Restaurar backup'],defaultId:0,cancelId:0
  });
  if(response!==1)return false;
  store.restoreBackup(restored);
  store.repeatTransactions();
  return snapshot();
}
