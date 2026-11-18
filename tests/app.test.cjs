'use strict';
const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {today}=require('../app/core.cjs');
const root=path.join(__dirname,'..');
const artifacts=path.join(__dirname,'artifacts');fs.mkdirSync(artifacts,{recursive:true});
const dir=fs.mkdtempSync(path.join(artifacts,'app-'));
const env={...process.env,ORBITA_TEST:'1',ORBITA_DATA_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;
let app,page;const errors=[];
async function launch(){
  app=await electron.launch({args:[root],env,cwd:root});
  page=await app.firstWindow();
  page.on('pageerror',error=>errors.push(error.message));
  try { await page.waitForSelector('#content'); }
  catch(error) {
    console.error('Janela do Órbita:', await page.locator('body').innerText(), errors);
    throw error;
  }
}
async function nav(label){await page.getByRole('button',{name:label,exact:true}).click();}
async function create(label,kind,values){
  await page.getByRole('button',{name:label,exact:true}).click();
  for(const [name,value] of Object.entries(values)){
    const el=page.locator(`#edit-form [name="${name}"]`);
    if(await el.evaluate(x=>x.tagName==='SELECT'))await el.selectOption(value);
    else if(typeof value==='boolean')await el.setChecked(value);
    else await el.fill(String(value));
  }
  await page.locator('#edit-form button[type="submit"]').click();
  await page.waitForFunction(()=>!document.querySelector('#editor').open);
  console.log('Created '+kind);
}
async function snapshot(){return page.evaluate(()=>window.orbita.read());}
(async()=>{
try{
  await launch();assert.equal(await page.locator('h1').innerText(),'Meu dia');
  await nav('Projetos e metas');
  await create('Novo projeto','project',{title:'Renovar escritório',description:'Organizar um espaço tranquilo para trabalhar.',date:today(),color:'blue'});
  let state=await snapshot();const project=state.projects[0];
  await nav('Tarefas');
  await create('Nova tarefa','task',{title:'Escolher a nova mesa',date:today(),priority:'high',projectId:project.id,notes:'Medir o espaço antes de comprar.'});
  await page.getByRole('button',{name:'Concluir tarefa: Escolher a nova mesa',exact:true}).click();
  await page.waitForFunction(async()=> (await window.orbita.read()).tasks[0].done);
  await page.getByRole('button',{name:'Todas',exact:true}).click();
  assert.equal(await page.locator('.task-row.done').count(),1);
  await page.getByRole('button',{name:'Reabrir tarefa: Escolher a nova mesa',exact:true}).click();
  await page.waitForFunction(async()=> !(await window.orbita.read()).tasks[0].done);
  await page.getByRole('textbox',{name:'Buscar nesta tela'}).fill('inexistente');assert.equal(await page.locator('.task-row').count(),0);
  await page.getByRole('textbox',{name:'Buscar nesta tela'}).fill('mesa');assert.equal(await page.locator('.task-row').count(),1);
  await nav('Calendário');
  await create('Novo compromisso','event',{title:'Planejar a semana',date:today(),time:'18:00',endTime:'18:30',reminder:true});
  assert.ok((await page.locator('.cal-event').allInnerTexts()).some(t=>t.includes('Planejar a semana')));
  assert.ok((await page.locator('.cal-event').allInnerTexts()).some(t=>t.includes('Escolher a nova mesa')));
  await page.screenshot({path:path.join(artifacts,'calendar.png')});
  await nav('Projetos e metas');
  await create('Nova meta','goal',{title:'Ler 12 livros',target:12,current:3,unit:'livros'});
  assert.match(await page.locator('.goal-number').innerText(),/3.*12/s);
  await nav('Hábitos');await create('Novo hábito','habit',{title:'Caminhar por 20 minutos',color:'green'});
  await page.locator(`[data-action="habit-check"][data-date="${today()}"]`).click();
  await page.waitForFunction(async()=> (await window.orbita.read()).habits[0].checks.length===1);
  assert.match(await page.locator('.habit-streak').innerText(),/^1/);
  await nav('Finanças');
  await create('Novo lançamento','income',{title:'Salário',date:today(),amount:'5000',type:'income',category:'Salário'});
  await create('Novo lançamento','expense',{title:'Mercado',date:today(),amount:'235.90',type:'expense',category:'Alimentação'});
  state=await snapshot();assert.equal(state.transactions[1].amount,23590);
  assert.match(await page.locator('.finance-stats').innerText(),/4\.764,10/);
  await nav('Notas');
  const malicious='Ideias <img src=x onerror="window.pwned=true">';
  await create('Nova nota','note',{title:malicious,content:'Pesquisar iluminação\nReorganizar a estante\nReservar uma tarde para planejar.',color:'amber'});
  assert.equal(await page.evaluate(()=>window.pwned),undefined);assert.equal(await page.locator('.note-card img').count(),0);
  await page.locator('.note-card').click();await page.locator('#edit-form [name="title"]').fill('Ideias para o escritório');await page.locator('#edit-form button[type="submit"]').click();await page.waitForFunction(()=>!document.querySelector('#editor').open);
  await nav('Foco');await page.locator('#focus-form [name="title"]').fill('Planejar o escritório');await page.getByRole('button',{name:'Iniciar foco',exact:true}).click();
  await page.getByRole('button',{name:'Pausar',exact:true}).click();state=await snapshot();assert.equal(state.focus.status,'paused');
  await page.getByRole('button',{name:'Continuar',exact:true}).click();await page.waitForFunction(async()=> (await window.orbita.read()).focus.status==='running');
  await nav('Configurações');await page.getByRole('textbox',{name:'Seu nome'}).fill('Pichau');await page.getByRole('button',{name:'Salvar',exact:true}).click();
  await page.getByRole('switch',{name:'Tema escuro',exact:true}).click();await page.waitForFunction(()=>document.body.classList.contains('dark'));
  await page.screenshot({path:path.join(artifacts,'settings-dark.png')});
  await page.getByRole('switch',{name:'Tema escuro',exact:true}).click();
  // Exercise the real native export/import handlers with deterministic file choices.
  const exportPath=path.join(dir,'export-test.json');
  await app.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath});},exportPath);
  await page.getByRole('button',{name:'Exportar backup',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Backup exportado'));
  assert.equal(JSON.parse(fs.readFileSync(exportPath,'utf8')).notes.length,1);
  await page.evaluate(()=>window.orbita.upsert('notes',{title:'Nota temporária'}));
  await app.evaluate(({dialog},filePath)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[filePath]});dialog.showMessageBox=async()=>({response:1});},exportPath);
  await page.getByRole('button',{name:'Restaurar backup',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#toast').textContent==='Backup restaurado.');
  state=await snapshot();assert.equal(state.notes.length,1);assert.equal(state.focus,null);
  assert.ok(fs.readdirSync(dir).some(f=>f.startsWith('antes-de-restaurar')));
  // Test completion after exit/restart: an elapsed session must be counted exactly once.
  await page.evaluate(()=>window.orbita.focus('start',{title:'Sessão encerrada após reiniciar',minutes:1}));
  await app.close();
  const file=path.join(dir,'dados.json');state=JSON.parse(fs.readFileSync(file,'utf8'));state.focus.endsAt=Date.now()-1000;fs.writeFileSync(file,JSON.stringify(state));
  await launch();await page.waitForFunction(async()=> (await window.orbita.read()).sessions.length===1);
  state=await snapshot();assert.equal(state.sessions[0].minutes,1);assert.equal(state.focus,null);assert.equal(state.tasks.length,1);assert.equal(state.events.length,1);assert.equal(state.settings.name,'Pichau');
  // Deletion confirmation and persisted removal.
  await nav('Notas');await page.locator('.note-card').click();await page.getByRole('button',{name:'Excluir',exact:true}).click();await page.getByRole('button',{name:'Excluir nota',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#editor').open);assert.equal((await snapshot()).notes.length,0);
  // Invalid reminder is rejected without losing the form.
  await nav('Tarefas');await page.getByRole('button',{name:'Nova tarefa',exact:true}).click();await page.locator('#edit-form [name="title"]').fill('Lembrete inválido');await page.locator('#edit-form [name="reminder"]').check();await page.locator('#edit-form button[type="submit"]').click();await page.locator('.form-error.show').waitFor();assert.equal((await snapshot()).tasks.length,1);await page.getByRole('button',{name:'Cancelar',exact:true}).click();
  await nav('Meu dia');await page.screenshot({path:path.join(artifacts,'dashboard.png')});
  // All screens must fit at the supported minimum width without horizontal overflow.
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1000,720));
  for(const label of ['Meu dia','Tarefas','Calendário','Projetos e metas','Hábitos','Finanças','Notas','Foco','Configurações']){await nav(label);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false,'Horizontal overflow: '+label);}
  await nav('Tarefas');
  await page.getByRole('button',{name:'Capturar',exact:true}).click();
  await page.getByRole('textbox',{name:'Título',exact:true}).fill('Conferir relatório');
  await page.getByRole('button',{name:'Salvar tarefa',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('#editor').open);
  await page.keyboard.press('Control+k');
  await page.getByRole('searchbox',{name:'Buscar no Órbita'}).fill('relatorio');
  await page.locator('#global-results').getByRole('button',{name:/Conferir relatório/}).click();
  await page.getByRole('button',{name:'Adicionar subtarefa'}).click();
  await page.getByRole('textbox',{name:'Nome da subtarefa'}).fill('Revisar dados');
  await page.locator('#edit-form [name=date]').fill(today());
  await page.getByLabel('Repetição').selectOption('weekly');
  await page.getByRole('button',{name:'Salvar alterações'}).click();
  await page.waitForFunction(()=>!document.querySelector('#editor').open);
  await page.getByRole('button',{name:'Prioridade de hoje: Conferir relatório'}).click();
  await page.waitForFunction(async()=> Object.values((await window.orbita.read()).priorities).some(ids=>ids.length===1));
  await nav('Calendário');
  await page.getByRole('button',{name:'Semana',exact:true}).click();
  await page.locator('.week-entry').filter({hasText:'Conferir relatório'}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await nav('Projetos e metas');
  await page.getByRole('button',{name:'Quadro',exact:true}).click();
  await page.getByRole('combobox',{name:'Status de Conferir relatório'}).selectOption('doing');
  await page.locator('[data-drop-status=doing]').getByText('Conferir relatório').waitFor();
  await nav('Configurações');
  await page.getByRole('button',{name:/Lixeira/}).click();
  await page.getByRole('button',{name:'Restaurar',exact:true}).click();
  await page.getByText('A lixeira está vazia.').waitFor();
  await page.getByRole('button',{name:'Fechar',exact:true}).click();
  await page.getByRole('button',{name:'Histórico de backups'}).click();
  await page.getByRole('button',{name:'Prévia e restauração'}).waitFor();
  assert.deepEqual(errors,[]);
  console.log('PASS: all modules, persistence, export/restore, focus, safe text and minimum-size layout');
  fs.writeFileSync(path.join(artifacts,'result.json'),JSON.stringify({passed:true,errors,dataDir:dir},null,2));
}catch(error){console.error(error);if(page)await page.screenshot({path:path.join(artifacts,'failure.png')}).catch(()=>{});process.exitCode=1;}
finally{if(app)await app.close().catch(()=>{});}
})();
