'use strict';

let reviewStart = '';
let reviewDay = '';
let financeView = 'records';
let forecastMonths = 3;

function backupLocationControls() {
  const path = db.runtime.backupPath;
  return `<section class="card pad feature-stack"><h2>Pasta de backup adicional</h2>
    <p class="tip">Guarde cópias diárias em outro disco ou em uma pasta sincronizada pelo Windows.</p>
    ${path ? `<p class="data-path">${e(path)}</p>` : '<p class="tip">Nenhuma pasta adicional selecionada.</p>'}
    <div class="settings-buttons"><button class="btn small" data-action="backup-choose">Escolher pasta de backup</button>
    ${path ? `<button class="btn small" data-action="backup-try" ${db.settings.automaticBackups ? '' : 'disabled'}>Verificar cópia de hoje</button>
    <button class="text-btn" data-action="backup-clear">Desvincular pasta</button>` : ''}</div></section>`;
}

function reviewTaskList(title, tasks, emptyMessage) {
  return `<section class="card pad feature-stack"><h3>${title} <span class="muted">· ${tasks.length}</span></h3>
    ${tasks.map(task => `<div class="review-task"><button class="feature-result" data-action="edit" data-kind="tasks" data-id="${e(task.id)}">
    <strong>${e(task.title)}</strong><small>${task.date ? 'Prazo ' + fmtDate(task.date) : 'Sem prazo'}
    ${task.plannedDate ? ' · Planejada para ' + fmtDate(task.plannedDate) : ''}</small></button>
    <button class="btn small" data-action="plan-task" data-id="${e(task.id)}" aria-label="Planejar ${e(task.title)}">Planejar</button></div>`).join('')
    || `<p class="tip">${emptyMessage}</p>`}</section>`;
}

function renderReview() {
  const today = localDate();
  if (!reviewStart) reviewStart = today;
  if (!reviewDay) reviewDay = reviewStart;
  const days = Array.from({ length: 7 }, (_, index) => shiftDay(reviewStart, index));
  const pending = sortedTasks(db.tasks.filter(task => !task.done));
  const inbox = pending.filter(task => !task.date && !task.plannedDate);
  const overdue = pending.filter(task => task.date && task.date < today);
  const unplanned = pending.filter(task => !task.plannedDate && task.date >= today);
  const planned = pending.filter(task => task.plannedDate === reviewDay);
  const priorities = (db.priorities[reviewDay] || []).map(id => db.tasks.find(task => task.id === id)).filter(Boolean);
  const entries = itemsAt(reviewDay);
  return `<div class="toolbar"><span class="month-name">${fmtDate(days[0])} a ${fmtDate(days[6])}</span><div class="actions">
    <button class="btn small" data-action="review-period" data-value="today">Próximos 7 dias</button>
    <button class="btn small" data-action="review-period" data-value="monday">Próxima semana</button>
    <button class="icon-btn" data-action="review-period" data-value="-7" aria-label="Período anterior">${icon('left')}</button>
    <button class="icon-btn" data-action="review-period" data-value="7" aria-label="Próximo período">${icon('right')}</button></div></div>
    <div class="review-days">${days.map(day => {
      const items = itemsAt(day);
      const work = items.filter(item => item.kind === 'tasks' && !item.deadlineOnly && !item.done);
      const minutes = work.reduce((total, item) => total + item.duration, 0);
      return `<button class="card review-day" data-action="review-day" data-value="${day}" aria-pressed="${day === reviewDay}">
        <strong>${fmtDate(day, { weekday: 'short', day: 'numeric' })}</strong><small>${work.length} tarefas planejadas</small>
        <small>${minutes} min de tarefas · ${items.filter(item => item.kind === 'events').length} compromissos</small></button>`;
    }).join('')}</div>
    <div class="two-col review-columns"><div class="stack">
      ${reviewTaskList('Caixa de entrada', inbox, 'Nenhuma tarefa sem data.')}
      ${reviewTaskList('Prazos atrasados', overdue, 'Nenhum prazo atrasado.')}
      ${reviewTaskList('Com prazo e sem planejamento', unplanned, 'Nenhuma tarefa aguardando planejamento.')}
    </div><div class="stack">
      <section class="card pad feature-stack"><h3>${fmtDate(reviewDay, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
        ${entries.length ? agendaRows(entries) : '<p class="tip">Agenda livre.</p>'}
        <button class="btn small" data-action="new" data-kind="tasks" data-date="${reviewDay}">Nova tarefa para este dia</button>
      </section><section class="card pad feature-stack"><h3>Prioridades <span class="muted">· ${priorities.length}/3</span></h3>
        ${priorities.map(task => taskRow(task, reviewDay)).join('') || '<p class="tip">Use a bandeira para escolher as prioridades.</p>'}
        ${planned.filter(task => !priorities.some(priority => priority.id === task.id)).map(task => taskRow(task, reviewDay)).join('')}
        ${planned.length ? '' : '<p class="tip">Planeje uma tarefa para este dia para poder priorizá-la aqui.</p>'}
      </section></div></div>`;
}

function openPlanTask(id) {
  const task = db.tasks.find(candidate => candidate.id === id);
  if (!task) return;
  openPanel('Planejar tarefa', `<form id="plan-task-form" data-id="${e(id)}" class="feature-stack"><strong>${e(task.title)}</strong>
    <p class="tip">Prazo de entrega ${task.date ? fmtDate(task.date) : 'em aberto'}</p>
    ${field('Data planejada', 'plannedDate', task.plannedDate || reviewDay || localDate(), 'date', 'required autofocus')}
    <div class="form-row">${field('Horário planejado', 'time', task.time, 'time')}
    ${field('Duração (minutos)', 'duration', task.duration || '', 'number', 'min="1" max="1440"')}</div>
    <div class="form-error" role="alert"></div><button class="btn primary" type="submit">Salvar planejamento</button></form>`);
}

function renderForecast() {
  const start = localDate();
  const months = window.orbitaForecast.expenseForecast(db.transactions, start, forecastMonths);
  const sum = entries => entries.reduce((total, item) => total + item.amount, 0);
  return `<div class="toolbar"><p class="tip">Lançamentos já cadastrados e estimativas de despesas recorrentes.</p>
    ${segmented('forecast-months', [['3', '3 meses'], ['6', '6 meses'], ['12', '12 meses']], String(forecastMonths))}</div>
    <div class="feature-stack">${months.map(({ month, recorded, projected }) => {
      const futureParcels = recorded.filter(item => item.installment && item.date >= start);
      const rows = [...futureParcels, ...projected].sort((a, b) => a.date.localeCompare(b.date));
      return `<section class="card pad feature-stack"><h3>${dayObj(month + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h3>
      <div class="forecast-totals"><div><small>Registrado</small><strong>${money(sum(recorded))}</strong></div>
      <div><small>Previsto</small><strong>${money(sum(projected))}</strong></div>
      <div><small>Total comprometido</small><strong>${money(sum(recorded) + sum(projected))}</strong></div></div>
      ${db.budgets.map(budget => {
        const committed = sum([...recorded, ...projected].filter(item => normalizeSearch(item.category) === normalizeSearch(budget.category)));
        return `<div class="progress-label"><span>${e(budget.category)}</span><span class="${committed > budget.amount ? 'overdue' : ''}">${money(committed)} / ${money(budget.amount)}</span></div>`;
      }).join('')}
      ${rows.length ? `<details><summary>Parcelas futuras e contas previstas (${rows.length})</summary>
        ${rows.map(item => `<div class="recovery-row"><div><strong>${e(item.title)}</strong><small>${fmtDate(item.date)} · ${item.installment ? 'Parcela ' + e(item.installment) + ' registrada' : 'Conta recorrente prevista'}</small></div><strong>${money(item.amount)}</strong></div>`).join('')}</details>` : ''}
      </section>`;
    }).join('')}</div>`;
}

function chooseReviewPeriod(value) {
  const today = localDate();
  if (value === 'today') reviewStart = today;
  else if (value === 'monday') reviewStart = shiftDay(window.orbitaDates.monday(today), 7);
  else reviewStart = shiftDay(reviewStart, Number(value));
  reviewDay = reviewStart;
  renderContent();
}
