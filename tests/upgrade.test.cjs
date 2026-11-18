'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Store, initial, validateBackup, setBudget } = require('../app/core.cjs');
const { nextDate, habitStreak } = require('../app/dates.js');
const { parseTransactions } = require('../app/finance.cjs');

function fixture() {
  const scratch = path.join(__dirname, 'scratch');
  fs.mkdirSync(scratch, { recursive: true });
  return new Store(fs.mkdtempSync(path.join(scratch, 'upgrade-')));
}

test('a v1 data file opens with linked records, notifications and a paused focus timer intact', () => {
  const store = fixture();
  const old = {
    ...initial(), schema: 1,
    projects: [{ id: 'project', title: 'Trabalho' }],
    tasks: [{ id: 'task', title: 'Entrega', projectId: 'project', date: '2026-11-18', time: '09:00', reminder: true, notifiedAt: '2026-11-18T12:00:00Z' }],
    habits: [{ id: 'habit', title: 'Caminhar', checks: ['2026-11-18'] }],
    focus: { title: 'Entrega', status: 'paused', minutes: 25, remaining: 1200 }
  };
  fs.writeFileSync(store.file, JSON.stringify(old));
  const migrated = new Store(store.dir);
  assert.equal(migrated.data.schema, 2);
  assert.equal(migrated.data.tasks[0].projectId, 'project');
  assert.equal(migrated.data.tasks[0].notifiedAt, old.tasks[0].notifiedAt);
  assert.equal(migrated.data.habits[0].frequency, 'daily');
  assert.equal(migrated.data.focus.remaining, 1200);
  migrated.upsert('tasks', { ...migrated.data.tasks[0], title: 'Entrega revisada' });
  assert.equal(new Store(store.dir).data.tasks[0].title, 'Entrega revisada');
  assert.equal(JSON.parse(fs.readFileSync(store.file + '.bak')).schema, 1);
});

test('recurring tasks create one next occurrence with a fresh checklist and a stable month anchor', () => {
  const store = fixture();
  const task = store.upsert('tasks', { title: 'Fechamento', date: '2027-01-31', repeat: 'monthly', subtasks: [{ title: 'Conferir', done: true }] });
  const done = store.upsert('tasks', { ...task, done: true });
  const february = store.data.tasks.find(item => !item.done);
  assert.equal(february.date, '2027-02-28');
  assert.equal(february.subtasks[0].done, false);
  store.upsert('tasks', { ...done, done: false });
  store.upsert('tasks', done);
  assert.equal(store.data.tasks.length, 2);
  store.upsert('tasks', { ...february, done: true });
  assert.equal(store.data.tasks.find(item => !item.done).date, '2027-03-31');
  assert.equal(nextDate('2026-11-20', 'weekdays'), '2026-11-23');
});

test('priorities cap at three and deleted records survive backup and restart', () => {
  const store = fixture();
  const tasks = ['a', 'b', 'c', 'd'].map(title => store.upsert('tasks', { title }));
  for (const task of tasks.slice(0, 3)) store.prioritize(task.id, '2026-11-18');
  assert.throws(() => store.prioritize(tasks[3].id, '2026-11-18'), /três/);
  store.remove('tasks', tasks[0].id);
  store.dailyBackup('2026-11-18');
  const restored = new Store(store.dir);
  const [backup] = restored.backups();
  const data = validateBackup(JSON.parse(fs.readFileSync(path.join(store.dir, 'backups', backup))));
  assert.equal(data.trash[0].item.id, tasks[0].id);
  restored.restore('tasks', tasks[0].id);
  assert.equal(restored.data.trash.length, 0);
  assert.equal(restored.data.tasks.length, 4);
});

test('habit streaks follow planned weekdays and weekly targets', () => {
  assert.equal(habitStreak({
    frequency: 'days', weekdays: [1, 3, 5], checks: ['2026-11-13', '2026-11-16', '2026-11-18']
  }, '2026-11-19'), 3);
  assert.equal(habitStreak({
    frequency: 'weekly', targetPerWeek: 2, checks: ['2026-11-09', '2026-11-11', '2026-11-16']
  }, '2026-11-19'), 1);
});

test('installments preserve cents and recurring finances catch up without duplicating months', () => {
  const store = fixture();
  store.upsert('transactions', { title: 'Compra', date: '2027-01-31', amount: 1000, installments: 3 });
  assert.deepEqual(store.data.transactions.map(({ date, amount }) => [date, amount]), [
    ['2027-01-31', 334], ['2027-02-28', 333], ['2027-03-31', 333]
  ]);
  store.upsert('transactions', { title: 'Conta', date: '2027-01-31', amount: 7000, repeat: 'monthly' });
  assert.equal(store.repeatTransactions('2027-04-30'), true);
  assert.equal(store.repeatTransactions('2027-04-30'), false);
  assert.deepEqual(store.data.transactions.filter(item => item.title === 'Conta').map(item => item.date), [
    '2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30'
  ]);
  store.change(data => setBudget(data, 'Casa', 10000));
  assert.deepEqual(new Store(store.dir).data.budgets, [{ category: 'Casa', amount: 10000 }]);
});

test('CSV handles Brazilian amounts and rejects invalid rows without a partial import', () => {
  const store = fixture();
  const rows = parseTransactions('descrição;data;tipo;valor;categoria\r\n"Compra; mercado";18/11/2026;Despesa;"1.234,56";Casa');
  assert.deepEqual(rows, [{ title: 'Compra; mercado', date: '2026-11-18', type: 'expense', amount: 123456, category: 'Casa' }]);
  assert.throws(() => store.importTransactions([...rows, { ...rows[0], date: '2026-02-30' }]), /Lançamento 2/);
  assert.equal(store.data.transactions.length, 0);
  store.importTransactions(rows);
  assert.equal(store.data.transactions[0].amount, 123456);
});
