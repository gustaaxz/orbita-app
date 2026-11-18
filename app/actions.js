'use strict';

function toast(message, undo=false){const el=$('#toast');el.textContent=message;if(undo){const button=document.createElement('button');button.textContent='Desfazer';button.dataset.action='undo-delete';el.append(' ',button);}el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),4500);}
function go(id){if(!headings[id])return;page=id;q='';render();window.scrollTo({top:0});}
async function refresh(promise,message=''){db=await promise;render();if(message)toast(message);}
document.addEventListener('input',event=>{if(event.target.id==='search'){q=event.target.value;renderContent();}if(event.target.id==='global-search')$('#global-results').innerHTML=globalResults(event.target.value);});
document.addEventListener('change',event=>{
  if(handleOrganizerChange(event.target))return;
  if(event.target.id==='project-filter'){projectFilter=event.target.value;renderContent();}
  if(event.target.id==='finance-month'&&event.target.value){financeMonth=event.target.value;renderContent();}
});
document.addEventListener('click',async event=>{
  const b=event.target.closest('[data-action]');if(!b||b.disabled)return;
  const a=b.dataset.action,id=b.dataset.id,kind=b.dataset.kind;
  try{
    if(await handleOrganizerClick(a,b))return;
    if(a==='nav')go(b.dataset.page);
    else if(a==='new')openEditor(kind,'',b.dataset.date||'');
    else if(a==='edit')openEditor(kind,id);
    else if(a==='close-modal')$('#editor').close();
    else if(a==='delete')confirmDelete(kind,id);
    else if(a==='delete-confirm'){b.disabled=true;await refresh(api.remove(kind,id));lastDeletion={kind,id};$('#editor').close();toast('Registro movido para a lixeira.',true);}
    else if(a==='task-toggle'){const item=db.tasks.find(t=>t.id===id);b.disabled=true;await refresh(api.upsert('tasks',{...item,done:!item.done}));}
    else if(a==='task-filter'){taskFilter=b.dataset.value;renderContent();}
    else if(a==='project-tasks'){projectFilter=id;taskFilter='all';go('tasks');}
    else if(a==='day'){selectedDate=b.dataset.date;calendarMonth=dayObj(selectedDate);go('calendar');}
    else if(a==='select-day'){selectedDate=b.dataset.date;renderContent();}
    else if(a==='calendar-month'){calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+Number(b.dataset.delta),1,12);renderContent();}
    else if(a==='calendar-today'){selectedDate=localDate();calendarMonth=new Date();renderContent();}
    else if(a==='habit-check'){b.disabled=true;await refresh(api.checkHabit(id,b.dataset.date));}
    else if(a==='habit-week'){habitOffset=Number(b.dataset.value);renderContent();}
    else if(a==='money-filter'){moneyFilter=b.dataset.value;renderContent();}
    else if(a==='setting-toggle'){const key=b.dataset.key;b.disabled=true;await refresh(key==='startup'?api.startup(!db.runtime.startup):api.settings({[key]:!db.settings[key]}),key==='startup'?'Preferência de inicialização atualizada.':'Preferência salva.');}
    else if(a==='export'){if(await api.export())toast('Backup exportado. Guarde o arquivo em um local seguro.');}
    else if(a==='import'){const result=await api.import();if(result){db=result;render();toast('Backup restaurado.');}}
    else if(a==='data-folder')await api.dataFolder();
    else if(a==='notification-test'){await api.testNotification();toast('Aviso enviado. Confira as notificações do Windows.');}
    else if(a.startsWith('focus-')){if(a==='focus-reset'){openFocusConfirm();}else {b.disabled=true;await refresh(api.focus(a.slice(6)));}}
    else if(a==='confirm-focus-reset'){await refresh(api.focus('reset'),'Sessão encerrada sem adicionar ao histórico.');$('#editor').close();}
    else if(a==='quit')await api.quit();
  }catch(error){b.disabled=false;toast(error.message);}
});
function openFocusConfirm(){const modal=$('#editor');modal.innerHTML=`<div class="modal-head"><h2>Encerrar sessão?</h2></div><div class="modal-body"><p class="confirm-text">A sessão atual será encerrada. Apenas sessões concluídas entram no histórico.</p></div><div class="modal-foot"><button class="btn" data-action="close-modal">Continuar focando</button><button class="btn danger" data-action="confirm-focus-reset">Encerrar sessão</button></div>`;modal.showModal();}
document.addEventListener('submit',async event=>{
  event.preventDefault();const form=event.target;if(saving)return;
  saving=true;const submit=form.querySelector('[type="submit"]');if(submit)submit.disabled=true;
  try{
    const values=Object.fromEntries(new FormData(form));
    if(await handleOrganizerForm(form,values))return;
    if(form.id==='edit-form'){
      const {kind,id}=form.dataset;const old=id?db[kind].find(x=>x.id===id):{};
      const item={...old,...values};if(id)item.id=id;
      if(kind==='tasks'||kind==='events')item.reminder=values.reminder==='on';
      if(kind==='tasks'){item.done=values.status==='done';item.subtasks=[...form.querySelectorAll('.subtask-row')].map(row=>({title:row.querySelector('[name=subtaskTitle]').value,done:row.querySelector('[name=subtaskDone]').checked}));}
      if(kind==='habits')item.weekdays=new FormData(form).getAll('weekdays').map(Number);
      if(kind==='transactions')item.amount=Math.round(Number(values.amount)*100);
      db=await api.upsert(kind,item);$('#editor').close();render();toast(id?'Alterações salvas.':`${kindNames[kind].charAt(0).toUpperCase()+kindNames[kind].slice(1)} ${['tasks','goals','notes'].includes(kind)?'criada':'criado'}.`);
    }else if(form.id==='name-form')await refresh(api.settings({name:values.name}),'Nome salvo.');
    else if(form.id==='focus-form')await refresh(api.focus('start',{title:values.title,minutes:Number(values.minutes)}),'Hora de focar.');
  }catch(error){const box=form.querySelector('.form-error');if(box){box.textContent=error.message;box.classList.add('show');}else toast(error.message);}
  finally{saving=false;if(submit)submit.disabled=false;}
});
document.addEventListener('keydown',event=>{
  if(event.ctrlKey&&event.key.toLowerCase()==='k'){event.preventDefault();openGlobalSearch();}
  if(event.ctrlKey&&event.key.toLowerCase()==='n'){event.preventDefault();if(!$('#editor').open&&db)openEditor('tasks');}
  if(event.ctrlKey&&event.key.toLowerCase()==='f'&&$('#search')&&!$('#editor').open){event.preventDefault();$('#search').focus();}
});
function remaining(){const f=db?.focus;return f?f.status==='running'?Math.max(0,Math.ceil((f.endsAt-Date.now())/1000)):f.remaining:1500;}
function updateTimers(){if(!db)return;const seconds=remaining(),text=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;document.querySelectorAll('[data-timer],[data-focus-timer]').forEach(el=>el.textContent=text);}
api.onUpdate(renderUpdate);
api.onCapture(openCapture);
api.onChange(async({message}={})=>{try{db=await api.read();render();if(message)toast(message);}catch(error){toast(error.message);}});
setInterval(updateTimers,1000);
let knownDay=localDate();setInterval(()=>{if(knownDay!==localDate()){knownDay=localDate();render();}},30000);
api.read().then(data=>{db=data;render();}).catch(error=>{$('#main').innerHTML=`<div class="workspace"><h1>Não foi possível abrir seus dados.</h1><p>${e(error.message)}</p></div>`;});
