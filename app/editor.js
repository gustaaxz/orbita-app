'use strict';

const kindNames={tasks:'tarefa',events:'compromisso',projects:'projeto',goals:'meta',habits:'hábito',transactions:'lançamento',notes:'nota'};
const colorSelect=value=>`<label class="field-label">Cor<select class="field" name="color">${[['green','Verde'],['blue','Azul'],['amber','Dourado'],['rose','Rosa'],['purple','Lavanda']].map(([id,label])=>`<option value="${id}" ${value===id?'selected':''}>${label}</option>`).join('')}</select></label>`;
const field=(label,name,value='',type='text',extra='')=>`<label class="field-label">${label}<input class="field" type="${type}" name="${name}" value="${e(value)}" ${extra}></label>`;
const textarea=(label,name,value='',extra='')=>`<label class="field-label">${label}<textarea class="field ${extra}" name="${name}" maxlength="${name==='content'?50000:10000}">${e(value)}</textarea></label>`;

function reminderFields(item, label) {
  return `<fieldset class="editor-options reminder-options"><legend>Lembrete</legend>
    <label class="checkbox-label"><input name="reminder" type="checkbox" ${item.reminder ? 'checked' : ''}> ${label}</label>
    <div class="reminder-lead">${selectField('Quando avisar', 'reminderLead', [
      ['0', 'No horário'], ['10', '10 minutos antes'], ['60', '1 hora antes'], ['1440', '1 dia antes']
    ], String(item.reminderLead || 0))}</div></fieldset>`;
}

function subtaskRow(subtask = {}) {
  return `<div class="subtask-row"><input type="checkbox" name="subtaskDone" aria-label="Subtarefa concluída" ${subtask.done ? 'checked' : ''}>
    <input class="field" name="subtaskTitle" maxlength="200" placeholder="Nome da subtarefa" aria-label="Nome da subtarefa" value="${e(subtask.title)}">
    <button type="button" class="icon-btn" data-action="subtask-remove" aria-label="Remover subtarefa">${icon('close')}</button></div>`;
}

function taskFields(task) {
  return `<div class="form-row">${selectField('Status', 'status', Object.entries(statusLabels), task.status || 'todo')}
    ${field('Duração (minutos)', 'duration', task.duration || '', 'number', 'min="1" max="1440"')}</div>
    ${selectField('Repetição', 'repeat', [['', 'Sem repetição'], ...Object.entries(repeatLabels)], task.repeat || '')}
    <p class="tip">A próxima tarefa aparece quando você conclui a atual.</p>
    <fieldset class="feature-stack editor-options"><legend>Subtarefas</legend><div id="subtask-list" class="feature-stack">
    ${(task.subtasks || []).map(subtaskRow).join('')}</div>
    <button class="btn small" type="button" data-action="subtask-add">${icon('plus')} Adicionar subtarefa</button></fieldset>`;
}

function habitFields(habit) {
  const weekdays = [[1, 'Seg'], [2, 'Ter'], [3, 'Qua'], [4, 'Qui'], [5, 'Sex'], [6, 'Sáb'], [0, 'Dom']];
  return `<div class="habit-frequency">${selectField('Frequência', 'frequency', [['daily', 'Todos os dias'], ['days', 'Dias da semana'], ['weekly', 'Vezes por semana']], habit.frequency || 'daily')}
    <fieldset class="editor-options habit-selected-days"><legend>Dias planejados</legend><div class="actions">
    ${weekdays.map(([day, label]) => `<label class="checkbox-label"><input type="checkbox" name="weekdays" value="${day}" ${habit.weekdays?.includes(day) ? 'checked' : ''}>${label}</label>`).join('')}</div></fieldset>
    <div class="habit-week-target">${field('Vezes por semana', 'targetPerWeek', habit.targetPerWeek || 3, 'number', 'min="1" max="7"')}</div></div>`;
}

function transactionFields(transaction, editing) {
  return `<div class="form-row">
    ${selectField('Repetição', 'repeat', [['', 'Sem repetição'], ['monthly', 'Mensal']], transaction.repeat || '')}
    ${editing ? (transaction.installment ? `<p class="tip">Parcela ${e(transaction.installment)}</p>` : '') :
    field('Parcelas', 'installments', 1, 'number', 'min="1" max="60"')}</div>
    <p class="tip">${editing ? 'A repetição mensal gera os próximos lançamentos nas datas programadas.' :
    'Para parcelar, informe o valor total. Parcelamento e repetição mensal são opções separadas.'}</p>`;
}
function openEditor(kind,id='',presetDate=''){
  if(!kindNames[kind])return;
  const item=id?db[kind].find(x=>x.id===id):null;if(id&&!item)return;
  const v=item||{title:'',date:kind==='tasks'?'':presetDate||(kind==='events'?selectedDate:kind==='transactions'?localDate():''),plannedDate:kind==='tasks'?presetDate:'',priority:'normal',type:'expense',color:'green',target:1,current:0};
  let fields=field(kind==='transactions'?'Descrição':'Título','title',v.title,'text','required maxlength="200" autofocus placeholder="'+({tasks:'O que você precisa fazer?',events:'Qual é o compromisso?',projects:'Dê um nome ao seu plano',goals:'O que você quer conquistar?',habits:'Ex.: Ler um pouco todos os dias',transactions:'Ex.: Mercado, salário, transporte',notes:'Uma ideia começa aqui…'}[kind])+'"');
  if(kind==='tasks')fields+=`<div class="form-row three">${field('Prazo de entrega','date',v.date,'date')}${field('Data planejada','plannedDate',v.plannedDate,'date')}${field('Horário planejado','time',v.time,'time')}</div><div class="form-row"><label class="field-label">Prioridade<select class="field" name="priority">${[['normal','Normal'],['high','Alta'],['low','Baixa']].map(([id,label])=>`<option value="${id}" ${v.priority===id?'selected':''}>${label}</option>`).join('')}</select></label><label class="field-label">Projeto<select class="field" name="projectId"><option value="">Sem projeto</option>${db.projects.map(p=>`<option value="${e(p.id)}" ${(v.projectId||(!item?projectFilter:''))===p.id?'selected':''}>${e(p.title)}</option>`).join('')}</select></label></div>${taskFields(v)}${textarea('Anotações (opcional)','notes',v.notes)}${reminderFields(v,'Lembrar no horário planejado')}`;
  if(kind==='events')fields+=`<div class="form-row three">${field('Data','date',v.date,'date','required')}${field('Início','time',v.time,'time')}${field('Término','endTime',v.endTime,'time')}</div>${colorSelect(v.color)}${textarea('Detalhes (opcional)','notes',v.notes)}${reminderFields(v,'Lembrar do compromisso')}<p class="tip" style="font-size:10px">Sem horário, o compromisso dura o dia inteiro. Para usar lembretes, informe um horário de início.</p>`;
  if(kind==='projects')fields+=`${textarea('Sobre este projeto (opcional)','description',v.description)}<div class="form-row">${field('Prazo (opcional)','date',v.date,'date')}${colorSelect(v.color)}</div>`;
  if(kind==='goals')fields+=`<div class="form-row">${field('Objetivo numérico','target',v.target,'number','required min="1" max="1000000000000" step="any"')}${field('Progresso atual','current',v.current,'number','required min="0" max="1000000000000" step="any"')}</div><div class="form-row">${field('Unidade (ex.: livros, km, R$)','unit',v.unit,'text','maxlength="40"')}${field('Prazo (opcional)','date',v.date,'date')}</div>${projectField(v.projectId)}${textarea('Seu plano (opcional)','description',v.description)}`;
  if(kind==='habits')fields+=`${colorSelect(v.color)}${habitFields(v)}`;
  if(kind==='transactions')fields+=`<div class="form-row"><label class="field-label">Tipo<select class="field" name="type"><option value="expense" ${v.type==='expense'?'selected':''}>Despesa</option><option value="income" ${v.type==='income'?'selected':''}>Receita</option></select></label>${field('Valor (R$)','amount',v.amount?v.amount/100:'','number','required min="0.01" max="10000000000" step="0.01"')}</div><div class="form-row">${field('Data','date',v.date||localDate(),'date','required')}${field('Categoria','category',v.category,'text','list="category-list" maxlength="80" placeholder="Ex.: Alimentação"')}</div><datalist id="category-list">${['Alimentação','Casa','Transporte','Saúde','Educação','Lazer','Salário','Trabalho','Outros'].map(x=>`<option value="${x}">`).join('')}</datalist>${transactionFields(v,!!item)}`;
  if(kind==='notes')fields+=`${textarea('Sua nota','content',v.content,'note-editor')}${colorSelect(v.color)}${projectField(v.projectId)}`;
  const modal=$('#editor');modal.innerHTML=`<form id="edit-form" data-kind="${kind}" data-id="${e(id)}"><div class="modal-head"><h2>${item?'Editar':['tasks','goals','notes'].includes(kind)?'Nova':'Novo'} ${kindNames[kind]}</h2><button type="button" class="icon-btn" data-action="close-modal" aria-label="Fechar">${icon('close')}</button></div><div class="modal-body">${fields}<div class="form-error" role="alert"></div></div><div class="modal-foot">${item?`<button class="btn danger small" type="button" data-action="delete" data-kind="${kind}" data-id="${e(id)}">${icon('trash')} Excluir</button>`:'<span></span>'}<div class="actions">${item&&kind==='tasks'?`<button type="button" class="btn" data-action="task-focus" data-id="${e(id)}">${icon('focus')} Foco</button>`:''}<button type="button" class="btn" data-action="close-modal">Cancelar</button><button class="btn primary" type="submit">${item?'Salvar alterações':'Criar '+kindNames[kind]}</button></div></div></form>`;if(!modal.open)modal.showModal();
}
function confirmDelete(kind,id){
  const item=db[kind].find(x=>x.id===id);if(!item)return;
  const modal=$('#editor');modal.innerHTML=`<div class="modal-head"><h2>Excluir ${kindNames[kind]}?</h2><button class="icon-btn" data-action="close-modal" aria-label="Fechar">${icon('close')}</button></div><div class="modal-body"><p class="confirm-text">“${e(item.title)}” será excluído.${kind==='projects'?' As tarefas deste projeto serão mantidas, sem projeto.':''}</p><p class="tip">Você pode restaurar este registro na lixeira.</p></div><div class="modal-foot"><button class="btn" data-action="edit" data-kind="${kind}" data-id="${e(id)}">Voltar</button><button class="btn danger" data-action="delete-confirm" data-kind="${kind}" data-id="${e(id)}">Excluir ${kindNames[kind]}</button></div>`;if(!modal.open)modal.showModal();
}
