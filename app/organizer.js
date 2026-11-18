'use strict';

let calendarView = 'month';
let projectView = 'cards';
let boardProject = '';
let habitView = 'week';
let habitMonth = localDate().slice(0, 7);
let lastDeletion;
const { shiftDay, shiftMonth, week, scheduled, habitStreak } = window.orbitaDates;
const statusLabels = { todo: 'A fazer', doing: 'Em andamento', done: 'Concluído' };
const repeatLabels = { daily: 'Diária', weekdays: 'Dias úteis', weekly: 'Semanal', monthly: 'Mensal' };

function selectField(label, name, options, selected) {
  return `<label class="field-label">${e(label)}<select class="field" name="${name}">${options.map(([value, text]) =>
    `<option value="${e(value)}" ${value === selected ? 'selected' : ''}>${e(text)}</option>`
  ).join('')}</select></label>`;
}

function projectField(selected) {
  return selectField('Projeto', 'projectId', [['', 'Sem projeto'], ...db.projects.map(p => [p.id, p.title])], selected);
}

function segmented(action, options, selected) {
  return `<div class="chips">${options.map(([value, label]) =>
    `<button class="chip ${selected === value ? 'active' : ''}" data-action="${action}" data-value="${value}" aria-pressed="${selected === value}">${label}</button>`
  ).join('')}</div>`;
}

function openPanel(title, content, footer = '') {
  const modal = $('#editor');
  modal.innerHTML = `<div class="modal-head"><h2>${e(title)}</h2><button type="button" class="icon-btn" data-action="close-modal" aria-label="Fechar">${icon('close')}</button></div><div class="modal-body">${content}</div>${footer ? `<div class="modal-foot">${footer}</div>` : ''}`;
  if (!modal.open) modal.showModal();
  modal.querySelector('[autofocus]')?.focus();
}

function openCapture() {
  if (!db || $('#editor').open) return;
  openPanel('Capturar tarefa', `<form id="capture-form" class="feature-stack">
    ${field('Título', 'title', '', 'text', 'required maxlength="200" autofocus')}
    ${field('Prazo (opcional)', 'date', '', 'date')}
    <div class="form-error" role="alert"></div>
    <button class="btn primary" type="submit">Salvar tarefa</button>
  </form>`);
}

const normalizeSearch = value => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function globalResults(query) {
  const terms = normalizeSearch(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return '<p class="tip">Busque tarefas, compromissos, projetos, metas, hábitos e notas.</p>';
  const results = ['tasks', 'events', 'projects', 'goals', 'habits', 'notes'].flatMap(kind =>
    db[kind].filter(item => {
      const text = normalizeSearch([item.title, item.notes, item.description, item.content].join(' '));
      return terms.every(term => text.includes(term));
    }).slice(0, 25).map(item => `<button class="feature-result" data-action="edit" data-kind="${kind}" data-id="${e(item.id)}"><strong>${e(item.title)}</strong><small>${e(kindNames[kind])}${item.date ? ' · ' + fmtDate(item.date) : ''}</small></button>`)
  );
  return results.length ? results.join('') : '<p class="tip">Nenhum resultado encontrado.</p>';
}

function openGlobalSearch() {
  if (!db || $('#editor').open) return;
  openPanel('Buscar no Órbita', `<div class="feature-stack">
    <input id="global-search" class="field" type="search" maxlength="200" placeholder="Digite para buscar…" aria-label="Buscar no Órbita" autofocus>
    <div id="global-results">${globalResults('')}</div>
  </div>`);
}

function renderPriorities(day) {
  const tasks = (db.priorities[day] || []).map(id => db.tasks.find(task => task.id === id)).filter(Boolean);
  return `<section class="card"><div class="card-head"><h2>Prioridades de hoje</h2>
    <button class="text-btn" data-action="nav" data-page="tasks">Escolher tarefas ${icon('arrow')}</button>
    </div><div class="card-body">${tasks.length ? tasks.map(task=>taskRow(task)).join('') : '<p class="tip">Use a bandeira em uma tarefa para marcar até três prioridades.</p>'}</div></section>`;
}

function renderWeek() {
  const days = week(selectedDate);
  return `<div class="toolbar"><span class="month-name">${fmtDate(days[0])} a ${fmtDate(days[6], { day: 'numeric', month: 'short', year: 'numeric' })}</span>
    <div class="actions"><button class="btn small" data-action="calendar-today">Hoje</button>
    <button class="icon-btn" data-action="calendar-week" data-value="-7" aria-label="Semana anterior">${icon('left')}</button>
    <button class="icon-btn" data-action="calendar-week" data-value="7" aria-label="Próxima semana">${icon('right')}</button></div></div>
    <div class="week-board">${days.map(day => `<section class="card week-column" data-drop-date="${day}">
      <h3>${fmtDate(day, { weekday: 'short', day: 'numeric' })}${day === localDate() ? ' · Hoje' : ''}</h3>
      <button class="btn small" data-action="new" data-kind="tasks" data-date="${day}" aria-label="Adicionar tarefa em ${fmtDate(day)}">${icon('plus')} Tarefa</button>
      ${itemsAt(day).map(item => `<button class="week-entry color-${item.color || 'green'}" data-action="edit" data-kind="${item.kind}" data-id="${e(item.id)}"
      ${item.kind === 'tasks' ? 'draggable="true"' : ''}><small>${e(item.time || (item.kind === 'events' ? 'Dia todo' : item.deadlineOnly ? 'Prazo' : 'Sem horário'))}
      ${item.endTime ? '– ' + e(item.endTime) : ''}${item.duration && !item.deadlineOnly ? ' · ' + item.duration + ' min' : ''}</small><strong>${e(item.title)}</strong></button>`).join('')}
    </section>`).join('')}</div>
    <p class="help-shortcut">Arraste uma tarefa para planejar outro dia. O prazo de entrega permanece.</p>`;
}

function renderProjectBoard() {
  const tasks = sortedTasks(db.tasks.filter(task => (!boardProject || task.projectId === boardProject) && matches(task.title, task.notes)));
  return `<div class="toolbar"><label class="field-label">Projeto<select id="board-project" class="field">
    <option value="">Todos os projetos</option>${db.projects.map(p =>
      `<option value="${e(p.id)}" ${p.id === boardProject ? 'selected' : ''}>${e(p.title)}</option>`).join('')}</select></label></div>
    <div class="kanban">${Object.entries(statusLabels).map(([status, label]) => {
      const column = tasks.filter(task => task.status === status);
      return `<section class="card board-column" data-drop-status="${status}"><h3>${label} <small>${column.length}</small></h3>
        ${column.map(task => `<div class="board-task" draggable="true" data-id="${e(task.id)}">
          <button class="feature-result" data-action="edit" data-kind="tasks" data-id="${e(task.id)}"><strong>${e(task.title)}</strong><small>${fmtDate(task.date)}</small></button>
          <select class="field" data-task-status="${e(task.id)}" aria-label="Status de ${e(task.title)}">${Object.entries(statusLabels).map(([value, name]) =>
            `<option value="${value}" ${value === status ? 'selected' : ''}>${name}</option>`).join('')}</select></div>`).join('')}
      </section>`;
    }).join('')}</div>`;
}

function trackedProject(project) {
  const minutes = db.sessions.filter(session => session.projectId === project.id).reduce((total, session) => total + session.minutes, 0);
  const links = ['notes', 'goals'].flatMap(kind => db[kind].filter(item => item.projectId === project.id).map(item =>
    `<button class="text-btn" data-action="edit" data-kind="${kind}" data-id="${e(item.id)}">${e(item.title)}</button>`));
  return `<div class="feature-links"><span>${minutes} min de foco</span>${links.join('')}</div>`;
}

function openTaskFocus(id) {
  const task = db.tasks.find(item => item.id === id);
  if (!task) return;
  if (db.focus) { $('#editor').close(); go('focus'); return; }
  openPanel('Iniciar foco', `<form id="task-focus-form" data-id="${e(id)}" class="feature-stack"><strong>${e(task.title)}</strong>
    ${field('Duração em minutos', 'minutes', Math.min(task.duration || 25, 240), 'number', 'min="1" max="240" required autofocus')}
    <div class="form-error" role="alert"></div><button class="btn primary" type="submit">Iniciar foco</button></form>`);
}

function habitCheckButton(habit, day) {
  const checked = habit.checks.includes(day);
  const allowed = day <= localDate() && (checked || scheduled(habit, day));
  return `<button class="habit-check ${checked ? 'checked' : ''}" data-action="habit-check" data-id="${e(habit.id)}" data-date="${day}"
    aria-label="${e(habit.title)} em ${fmtDate(day, { day: 'numeric', month: 'long' })}" aria-pressed="${checked}" ${allowed ? '' : 'disabled'}>
    ${checked ? icon('check') : '<span aria-hidden="true">·</span>'}</button>`;
}

function renderHabitHistory() {
  return `<div class="toolbar"><label class="field-label">Mês do histórico<input id="habit-month" class="field" type="month" value="${habitMonth}"></label></div>
    ${db.habits.map(habit => {
      const month = dayObj(habitMonth + '-01');
      const days = monthDays(month);
      return `<section class="card pad feature-stack habit-month"><h3>${e(habit.title)}</h3>${weekLabels()}<div class="mini-grid">
        ${days.map(day => day.getMonth() === month.getMonth()
          ? `<div class="habit-date"><span>${day.getDate()}</span>${habitCheckButton(habit, localDate(day))}</div>`
          : '<div></div>').join('')}</div></section>`;
    }).join('') || '<p class="tip">Adicione um hábito para ver o histórico.</p>'}`;
}

function renderBudgets(monthly) {
  return `<section class="card pad feature-stack"><div class="toolbar"><h2>Orçamentos por categoria</h2><button class="btn small" data-action="budget-edit">Definir limite</button></div>
  ${db.budgets.map(budget => {
    const spent = monthly.filter(item => item.type === 'expense' && normalizeSearch(item.category) === normalizeSearch(budget.category))
      .reduce((sum, item) => sum + item.amount, 0);
    return `<div><div class="progress-label"><button class="text-btn" data-action="budget-edit" data-value="${e(budget.category)}">${e(budget.category)}</button>
      <span class="${spent > budget.amount ? 'overdue' : ''}">${money(spent)} / ${money(budget.amount)}</span></div>
      <progress class="budget-meter" max="${budget.amount}" value="${Math.min(spent, budget.amount)}" aria-label="Orçamento de ${e(budget.category)}"></progress></div>`;
  }).join('') || '<p class="tip">Defina limites mensais para acompanhar seus gastos.</p>'}</section>`;
}

function openBudget(category = '') {
  const budget = db.budgets.find(item => item.category === category);
  openPanel('Orçamento mensal', `<form id="budget-form" class="feature-stack">
    ${field('Categoria', 'category', category, 'text', 'required maxlength="80" autofocus')}
    ${field('Limite mensal (R$)', 'amount', budget ? budget.amount / 100 : '', 'number', 'min="0" max="10000000000" step="0.01" required')}
    <p class="tip">Use zero para remover o limite da categoria.</p>
    <div class="form-error" role="alert"></div><button class="btn primary" type="submit">Salvar limite</button></form>`);
}

function openTrash() {
  openPanel('Lixeira', db.trash.map(({ kind, item, deletedAt }) =>
    `<div class="recovery-row"><div><strong>${e(item.title)}</strong><small>${e(kindNames[kind])}${deletedAt ? ' · ' + fmtDate(deletedAt.slice(0, 10)) : ''}</small></div>
      <button class="btn small" data-action="restore-item" data-kind="${kind}" data-id="${e(item.id)}">Restaurar</button></div>`
  ).join('') || '<p class="tip">A lixeira está vazia.</p>');
}

async function openBackups() {
  const backups = await api.backups();
  const rows = (source, names) => names.map(name =>
    `<div class="recovery-row"><strong>${fmtDate(name.slice(7, 17), { day: 'numeric', month: 'long', year: 'numeric' })}</strong>
      <button class="btn small" data-action="restore-daily" data-source="${source}" data-value="${e(name)}">Prévia e restauração</button></div>`
  ).join('') || '<p class="tip">Nenhuma cópia disponível.</p>';
  openPanel('Backups automáticos', `<div class="feature-stack"><section><h3>Neste computador</h3>${rows('local', backups.local)}</section>
    ${db.runtime.backupPath ? `<section><h3>Pasta adicional</h3>${backups.externalError ? `<p class="tip">${e(backups.externalError)}</p>` : rows('external', backups.external)}</section>` : ''}</div>`);
}

function updateControls(state) {
  const { status, version, progress, message } = state;
  if (status === 'unavailable') return '<p class="tip">Disponível ao instalar pelo executável do Órbita.</p>';
  const labels = {
    idle: 'Consulte as versões disponíveis no GitHub.', checking: 'Verificando atualizações…',
    current: 'O Órbita está atualizado.', available: `Versão ${version} disponível.`,
    downloading: `Baixando ${version} · ${progress ?? 0}%`, ready: `Versão ${version} pronta para instalar.`, error: message
  };
  const action = status === 'available' ? ['download', 'Baixar atualização']
    : status === 'ready' ? ['install', 'Instalar e reiniciar']
    : ['idle', 'current', 'error'].includes(status) ? ['check', 'Verificar atualizações'] : null;
  return `<p class="tip" role="status">${e(labels[status])}</p>${action ? `<button class="btn small" data-action="app-update" data-value="${action[0]}">${action[1]}</button>` : ''}`;
}

function renderUpdate(state) {
  if (!db) return;
  const previous = db.runtime.update.status;
  db.runtime.update = state;
  const panel = $('#update-controls');
  if (panel) panel.innerHTML = updateControls(state);
  if (state.status === 'available' && previous !== 'available' && !panel) {
    toast(`Órbita ${state.version} disponível em Configurações.`);
  }
}

async function changeTaskStatus(id, status) {
  const task = db.tasks.find(item => item.id === id);
  if (task && statusLabels[status] && task.status !== status) {
    await refresh(api.upsert('tasks', { ...task, status, done: status === 'done' }));
  }
}

function handleOrganizerChange(target) {
  if (target.id === 'board-project') boardProject = target.value;
  else if (target.id === 'habit-month' && /^[0-9]{4}-[0-9]{2}$/.test(target.value)) habitMonth = target.value;
  else if (target.dataset.taskStatus) {
    void changeTaskStatus(target.dataset.taskStatus, target.value).catch(error => {
      renderContent();
      toast(error.message);
    });
    return true;
  } else return false;
  renderContent();
  return true;
}

async function handleOrganizerClick(action, button) {
  const { value, kind, id } = button.dataset;
  switch (action) {
    case 'capture': openCapture(); break;
    case 'global-search': openGlobalSearch(); break;
    case 'priority': await refresh(api.priority(id, button.dataset.date || localDate())); break;
    case 'calendar-view': calendarView = value; renderContent(); break;
    case 'calendar-week': selectedDate = shiftDay(selectedDate, Number(value)); calendarMonth = dayObj(selectedDate); renderContent(); break;
    case 'review-period': chooseReviewPeriod(value); break;
    case 'review-day': reviewDay = value; renderContent(); break;
    case 'plan-task': openPlanTask(id); break;
    case 'finance-view': financeView = value; renderContent(); break;
    case 'forecast-months': forecastMonths = Number(value); renderContent(); break;
    case 'project-view': projectView = value; renderContent(); break;
    case 'habit-view': habitView = value; renderContent(); break;
    case 'task-focus': openTaskFocus(id); break;
    case 'subtask-add': {
      const list = $('#subtask-list');
      if (list.children.length >= 50) { toast('Use até 50 subtarefas.'); break; }
      list.insertAdjacentHTML('beforeend', subtaskRow());
      list.lastElementChild.querySelector('[name=subtaskTitle]').focus();
      break;
    }
    case 'subtask-remove': button.closest('.subtask-row').remove(); break;
    case 'budget-edit': openBudget(value); break;
    case 'open-trash': openTrash(); break;
    case 'open-backups': await openBackups(); break;
    case 'backup-choose': {
      const state = await api.chooseBackup();
      if (state) await refresh(state, 'Pasta adicional configurada.');
      break;
    }
    case 'backup-clear': await refresh(api.clearBackup(), 'Pasta adicional desvinculada.'); break;
    case 'backup-try': await refresh(api.retryBackup(), 'Cópia adicional de hoje disponível.'); break;
    case 'restore-item':
      button.disabled = true;
      await refresh(api.restoreItem(kind, id), 'Registro restaurado.');
      openTrash();
      break;
    case 'undo-delete':
      if (!lastDeletion) break;
      button.disabled = true;
      await refresh(api.restoreItem(lastDeletion.kind, lastDeletion.id), 'Registro restaurado.');
      lastDeletion = undefined;
      break;
    case 'restore-daily': {
      button.disabled = true;
      try {
        const state = await api.restoreDaily(value, button.dataset.source);
        if (state) {
          db = state;
          $('#editor').close();
          render();
          toast('Backup restaurado.');
        }
      } finally { button.disabled = false; }
      break;
    }
    case 'import-csv': {
      openPanel('Importar CSV', '<p class="tip">Use as colunas descrição, data, tipo, valor e categoria. O tipo pode ser Receita ou Despesa. Datas aceitas: AAAA-MM-DD ou DD/MM/AAAA.</p><pre class="csv-example">descrição;data;tipo;valor;categoria\nMercado;18/11/2026;Despesa;45,90;Alimentação</pre>',
        '<button class="btn primary" data-action="choose-csv">Selecionar CSV</button>');
      break;
    }
    case 'choose-csv': {
      button.disabled = true;
      try {
        const state = await api.importCsv();
        if (state) {
          $('#editor').close();
          db = state;
          render();
          toast('Lançamentos importados.');
        }
      } finally { button.disabled = false; }
      break;
    }
    case 'app-update':
      button.disabled = true;
      try { renderUpdate(await api.update(value)); }
      finally { button.disabled = false; }
      break;
    default: return false;
  }
  return true;
}

async function handleOrganizerForm(form, values) {
  if (form.id === 'capture-form') {
    await refresh(api.upsert('tasks', values), 'Tarefa capturada.');
  } else if (form.id === 'budget-form') {
    await refresh(api.budget(values.category, Math.round(Number(values.amount) * 100)), 'Orçamento atualizado.');
  } else if (form.id === 'task-focus-form') {
    await refresh(api.focus('start', { taskId: form.dataset.id, minutes: Number(values.minutes) }), 'Sessão iniciada.');
    go('focus');
  } else if (form.id === 'plan-task-form') {
    const task = db.tasks.find(item => item.id === form.dataset.id);
    if (!task) throw new Error('A tarefa não está mais disponível.');
    db = await api.upsert('tasks', { ...task, ...values, reminder: !!values.time && task.reminder });
    reviewDay = values.plannedDate;
    if (reviewDay < reviewStart || reviewDay > shiftDay(reviewStart, 6)) reviewStart = reviewDay;
    render();
    toast('Planejamento salvo.');
  } else return false;
  $('#editor').close();
  return true;
}

let draggedTask;
document.addEventListener('dragstart', event => {
  const card = event.target.closest('[draggable=true][data-id]');
  if (!card) return;
  draggedTask = card.dataset.id;
  event.dataTransfer.setData('text/plain', draggedTask);
  event.dataTransfer.effectAllowed = 'move';
});
document.addEventListener('dragend', () => { draggedTask = undefined; });
document.addEventListener('dragover', event => {
  if (draggedTask && event.target.closest('[data-drop-date], [data-drop-status]')) event.preventDefault();
});
document.addEventListener('drop', async event => {
  const column = event.target.closest('[data-drop-date], [data-drop-status]');
  const task = draggedTask && db.tasks.find(item => item.id === draggedTask);
  if (!column || !task) return;
  event.preventDefault();
  draggedTask = undefined;
  try {
    if (column.dataset.dropStatus) await changeTaskStatus(task.id, column.dataset.dropStatus);
    else if (column.dataset.dropDate !== task.plannedDate) {
      await refresh(api.upsert('tasks', { ...task, plannedDate: column.dataset.dropDate }), 'Planejamento atualizado.');
    }
  } catch (error) { toast(error.message); }
});
