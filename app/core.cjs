'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { localDate: today, nextDate, shiftDay, shiftMonth, scheduled, dayDistance } = require('./dates.js');
const COLLECTIONS = ['tasks', 'events', 'projects', 'goals', 'habits', 'transactions', 'notes', 'sessions'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const colors = ['green', 'blue', 'amber', 'rose', 'purple'];
function dateOK(v) { if (!DATE_RE.test(v)) return false; const d = new Date(`${v}T12:00:00`); return Number.isFinite(+d) && today(d) === v; }
function str(v, max = 300) { return typeof v === 'string' ? v.trim().slice(0,max) : ''; }
function date(v) { if (!v) return ''; if (!dateOK(v)) throw new Error('Informe uma data válida.'); return v; }
function num(v, min, max) { if (!Number.isFinite(Number(v)) || Number(v)<min || Number(v)>max) throw new Error('Valor fora do intervalo permitido.'); return Number(v); }
function clean(kind, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Registro inválido.');
  let o = { title: str(input.title, 200) };
  if (kind !== 'sessions' && !o.title) throw new Error('Escreva um título.');
  if (kind === 'tasks') o = {...o, notes:str(input.notes,10000), date:date(input.date), time:input.time || '', priority:['low','normal','high'].includes(input.priority)?input.priority:'normal', projectId:str(input.projectId,80), done:!!input.done, reminder:!!input.reminder};
  if (kind === 'events') o = {...o, notes:str(input.notes,10000), date:date(input.date), time:input.time || '', endTime:input.endTime || '', color:colors.includes(input.color)?input.color:'green', reminder:!!input.reminder};
  if (kind === 'projects') o = {...o, description:str(input.description,10000), date:date(input.date), color:colors.includes(input.color)?input.color:'green'};
  if (kind === 'goals') o = {...o, description:str(input.description,10000), date:date(input.date), target:num(input.target,1,1e12), current:num(input.current ?? 0,0,1e12), unit:str(input.unit,40)};
  if (kind === 'habits') o = {...o, color:colors.includes(input.color)?input.color:'green', checks:[...new Set((Array.isArray(input.checks)?input.checks:[]).filter(dateOK))].sort()};
  if (kind === 'transactions') o = {...o, date:date(input.date), type:input.type === 'income'?'income':'expense', amount:Math.round(num(input.amount,1,1e12)), category:str(input.category,80)||'Outros'};
  if (kind === 'notes') o = {...o, content:str(input.content,50000), color:colors.includes(input.color)?input.color:'green'};
  if (kind === 'sessions') o = {title:str(input.title,200)||'Sessão de foco', minutes:num(input.minutes,1,240), date:date(input.date)};
  if (kind === 'tasks') {
    // The old task time was tied to its deadline. Preserve that appointment on upgrade.
    o.plannedDate = date(input.plannedDate ?? (o.time ? o.date : ''));
    o.status = o.done ? 'done' : input.status === 'doing' ? 'doing' : 'todo';
    o.duration = Math.floor(num(input.duration || 0, 0, 1440));
    o.repeat = ['daily', 'weekdays', 'weekly', 'monthly'].includes(input.repeat) ? input.repeat : '';
    const anchor = o.date || o.plannedDate;
    if (o.repeat && !anchor) throw new Error('Escolha a data inicial da repetição.');
    o.repeatDay = Math.floor(num(input.repeatDay || Number(anchor.slice(-2)) || 1, 1, 31));
    o.previousId = str(input.previousId, 80);
    o.subtasks = (Array.isArray(input.subtasks) ? input.subtasks : []).slice(0, 50)
      .map(subtask => ({ title: str(subtask?.title, 200), done: !!subtask?.done }))
      .filter(subtask => subtask.title);
  }
  if (['notes', 'goals', 'sessions'].includes(kind)) o.projectId = str(input.projectId, 80);
  if (kind === 'sessions') o.taskId = str(input.taskId, 80);
  if (kind === 'habits') {
    o.frequency = ['days', 'weekly'].includes(input.frequency) ? input.frequency : 'daily';
    o.weekdays = [...new Set((Array.isArray(input.weekdays) ? input.weekdays : [])
      .filter(day => Number.isInteger(day) && day >= 0 && day < 7))];
    if (o.frequency === 'days' && !o.weekdays.length) throw new Error('Escolha pelo menos um dia da semana.');
    o.targetPerWeek = Math.floor(num(input.targetPerWeek || 3, 1, 7));
  }
  if (kind === 'transactions') {
    o.repeat = input.repeat === 'monthly' ? 'monthly' : '';
    o.repeatDay = Math.floor(num(input.repeatDay || Number(o.date.slice(-2)) || 1, 1, 31));
    o.installment = str(input.installment, 12);
  }
  if (['tasks','events'].includes(kind)) {
    const reminderDay = kind === 'tasks' ? o.plannedDate : o.date;
    if (o.time && !TIME_RE.test(o.time)) throw new Error('Informe um horário válido.');
    if (o.time && !reminderDay) throw new Error('Escolha a data do horário.');
    if (o.reminder && (!reminderDay || !o.time)) throw new Error('O lembrete precisa de data e horário.');
    o.reminderLead = [10, 60, 1440].includes(Number(input.reminderLead)) ? Number(input.reminderLead) : 0;
    if (kind==='events') {
      if (!o.date) throw new Error('Escolha a data do compromisso.');
      if (o.endTime && (!TIME_RE.test(o.endTime) || !o.time || o.endTime<=o.time)) throw new Error('O término deve ser depois do início, no mesmo dia.');
    }
  }
  if (kind==='transactions' && !o.date) throw new Error('Escolha a data do lançamento.');
  return o;
}
function initial() {
  return {
    schema: 3, tasks: [], events: [], projects: [], goals: [], habits: [], transactions: [], notes: [], sessions: [],
    trash: [], priorities: {}, budgets: [],
    settings: { name: '', dark: false, closeToTray: true, notifications: true, automaticBackups: true, checkForUpdates: true },
    focus: null
  };
}

function cleanRecord(kind, item) {
  return {
    ...clean(kind, item), id: str(item.id, 80), createdAt: str(item.createdAt, 40),
    updatedAt: str(item.updatedAt, 40), notifiedAt: str(item.notifiedAt, 50),
    snoozedUntil: Number.isSafeInteger(item.snoozedUntil) && item.snoozedUntil > 0 ? item.snoozedUntil : 0
  };
}

function makeRecord(item, old, now = new Date().toISOString()) {
  const sameReminder = old && (old.plannedDate ?? old.date) === (item.plannedDate ?? item.date)
    && old.time === item.time && old.reminder === item.reminder && old.reminderLead === item.reminderLead && old.done === item.done;
  return {
    ...item, id: old?.id || randomUUID(), createdAt: old?.createdAt || now, updatedAt: now,
    notifiedAt: sameReminder ? old.notifiedAt || '' : '',
    snoozedUntil: sameReminder ? old.snoozedUntil || 0 : 0
  };
}

function validateBackup(raw) {
  if (!raw || ![1, 2, 3].includes(raw.schema) || !COLLECTIONS.every(k=>Array.isArray(raw[k]))) throw new Error('Este arquivo não é um backup válido do Órbita.');
  const out=initial();
  for (const kind of COLLECTIONS) {
    if(raw[kind].length>50000) throw new Error('Backup muito grande.');
    const ids=new Set();
    out[kind]=raw[kind].map(item=>{
      const record = cleanRecord(kind, item);
      if (!record.id || ids.has(record.id)) throw new Error('Backup contém registros duplicados ou sem identificação.');
      ids.add(record.id);
      return record;
    });
  }
  out.settings={name:str(raw.settings?.name,60),dark:!!raw.settings?.dark,closeToTray:raw.settings?.closeToTray!==false,notifications:raw.settings?.notifications!==false};
  out.settings.automaticBackups = raw.settings?.automaticBackups !== false;
  out.settings.checkForUpdates = raw.settings?.checkForUpdates !== false;
  if (raw.schema >= 2) {
    if (raw.trash !== undefined && (!Array.isArray(raw.trash) || raw.trash.length > 50000)) throw new Error('Lixeira inválida no backup.');
    const deleted = new Set();
    out.trash = (raw.trash || []).map(entry => {
      if (!COLLECTIONS.includes(entry?.kind) || entry.kind === 'sessions') throw new Error('Lixeira inválida no backup.');
      const item = cleanRecord(entry.kind, entry.item);
      const key = entry.kind + ':' + item.id;
      if (!item.id || deleted.has(key) || out[entry.kind].some(active => active.id === item.id)) {
        throw new Error('Registro duplicado na lixeira.');
      }
      deleted.add(key);
      return { kind: entry.kind, item, deletedAt: str(entry.deletedAt, 40) };
    });
    for (const [day, ids] of Object.entries(raw.priorities || {})) {
      if (dateOK(day) && Array.isArray(ids)) out.priorities[day] = [...new Set(ids.filter(id => typeof id === 'string' && id.length <= 80))].slice(0, 3);
    }
    if (Array.isArray(raw.budgets)) {
      for (const budget of raw.budgets) setBudget(out, budget?.category, budget?.amount);
    }
  }
  // A restore never starts a timer unexpectedly.
  out.focus=null;
  return out;
}

function setBudget(data, category, amount) {
  const name = str(category, 80);
  if (!name) throw new Error('Informe uma categoria.');
  const cents = Math.round(num(amount, 0, 1e12));
  const key = value => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  data.budgets = data.budgets.filter(budget => key(budget.category) !== key(name));
  if (cents) data.budgets.push({ category: name, amount: cents });
}

const projectCollections = ['tasks', 'notes', 'goals'];

class Store {
  constructor(dir) {
    this.dir=dir; this.file=path.join(dir,'dados.json'); this.recovered=false;
    fs.mkdirSync(dir,{recursive:true});
    if (!fs.existsSync(this.file)) {this.data=initial();this.write(this.data);return;}
    try { this.data=this.read(this.file); }
    catch(error) {
      // Keep the damaged file available; never silently replace it with empty data.
      try { this.data=this.read(this.file+'.bak'); fs.copyFileSync(this.file,path.join(dir,`dados-danificados-${Date.now()}.json`)); this.recovered=true; }
      catch { throw new Error('Não foi possível ler os dados nem a cópia de segurança. Os arquivos foram preservados. Restaure um backup antes de continuar.'); }
    }
  }
  read(file) {
    const raw=JSON.parse(fs.readFileSync(file,'utf8')); const out=validateBackup(raw);
    const f=raw.focus;
    if (f && Number.isFinite(f.remaining) && f.remaining>=0 && f.remaining<=14400 && ['running','paused'].includes(f.status)) {
      if (f.status!=='running' || (Number.isFinite(f.endsAt) && f.endsAt>0)) out.focus={title:str(f.title,200),minutes:num(f.minutes,1,240),remaining:f.remaining,status:f.status,endsAt:f.endsAt || null,taskId:str(f.taskId,80),projectId:str(f.projectId,80)};
    }
    return out;
  }
  write(next) {
    const tmp=this.file+'.tmp';
    fs.writeFileSync(tmp,JSON.stringify(next,null,2),'utf8');
    if (fs.existsSync(this.file) && !this.recovered) fs.copyFileSync(this.file,this.file+'.bak');
    fs.renameSync(tmp,this.file); this.data=next; this.recovered=false;
  }
  change(fn) { const next=structuredClone(this.data); const result=fn(next); this.write(next); return result; }
  upsert(kind,input) {
    if (!COLLECTIONS.includes(kind) || kind==='sessions') throw new Error('Tipo de registro inválido.');
    const item=clean(kind,input); let result;
    this.change(data=>{
      const index=input.id?data[kind].findIndex(x=>x.id===input.id):-1;
      if(input.id && index<0) throw new Error('Este registro não existe mais.');
      if(projectCollections.includes(kind) && item.projectId && !data.projects.some(p=>p.id===item.projectId)) throw new Error('O projeto não existe mais.');
      const old=index>=0?data[kind][index]:null;
      if (old && 'repeatDay' in item) {
        const anchor = item.date || item.plannedDate;
        item.repeatDay = (old.date || old.plannedDate) === anchor ? old.repeatDay : Number(anchor.slice(-2)) || 1;
      }
      const installments = kind === 'transactions' && !old ? Number(input.installments || 1) : 1;
      if (!Number.isInteger(installments) || installments < 1 || installments > 60) throw new Error('Escolha entre 1 e 60 parcelas.');
      if (installments > 1) {
        if (item.repeat || item.amount < installments) throw new Error('Use um valor de pelo menos um centavo por parcela, sem repetição mensal.');
        for (let i = 0; i < installments; i++) {
          const installment = makeRecord({
            ...item, date: date(shiftMonth(item.date, i)), installment: `${i + 1}/${installments}`,
            amount: Math.floor(item.amount / installments) + Number(i < item.amount % installments)
          });
          data.transactions.push(installment);
          if (i === 0) result = installment;
        }
        return;
      }
      result=makeRecord(item,old);
      if(index>=0)data[kind][index]=result;else data[kind].push(result);
      if (kind === 'tasks' && item.done && !old?.done && item.repeat) {
        const hasNext = record => record.previousId === result.id;
        if (data.tasks.some(hasNext) || data.trash.some(entry => entry.kind === 'tasks' && hasNext(entry.item))) return;
        const anchor = item.date || item.plannedDate;
        const next = nextDate(anchor, item.repeat, item.repeatDay);
        const offset = dateOK(next) ? dayDistance(anchor, next) : 0;
        if (dateOK(next)) data.tasks.push(makeRecord({
          ...item, date: item.date ? next : '',
          plannedDate: item.plannedDate ? date(shiftDay(item.plannedDate, offset)) : '',
          done: false, status: 'todo', previousId: result.id,
          subtasks: item.subtasks.map(subtask => ({ ...subtask, done: false }))
        }));
      }
    }); return result;
  }
  remove(kind,id) {
    if(!COLLECTIONS.includes(kind) || kind==='sessions') throw new Error('Tipo de registro inválido.');
    const item = this.data[kind].find(record => record.id === id);
    if (!item) throw new Error('Este registro não existe mais.');
    this.change(data => {
      data[kind] = data[kind].filter(record => record.id !== id);
      data.trash.unshift({ kind, item, deletedAt: new Date().toISOString() });
      if (kind === 'projects') {
        for (const collection of projectCollections) {
          for (const record of data[collection]) if (record.projectId === id) record.projectId = '';
        }
      }
    });
  }

  snoozeReminder(kind, id, until, deliveredAt) {
    if (!['tasks', 'events'].includes(kind)) return false;
    const record = this.data[kind].find(item => item.id === id);
    if (!record?.reminder || record.done || record.notifiedAt !== deliveredAt || record.snoozedUntil) return false;
    this.change(data => { data[kind].find(item => item.id === id).snoozedUntil = until; });
    return true;
  }

  restore(kind, id) {
    this.change(data => {
      const index = data.trash.findIndex(entry => entry.kind === kind && entry.item.id === id);
      if (index < 0) throw new Error('Este registro não está mais na lixeira.');
      const [{ item }] = data.trash.splice(index, 1);
      if (item.projectId && !data.projects.some(p => p.id === item.projectId)) item.projectId = '';
      data[kind].push(item);
    });
  }

  prioritize(id, day) {
    if (!dateOK(day) || !this.data.tasks.some(task => task.id === id)) throw new Error('Tarefa ou data inválida.');
    this.change(data => {
      const ids = data.priorities[day] || [];
      if (ids.includes(id)) data.priorities[day] = ids.filter(value => value !== id);
      else {
        const active = ids.filter(value => data.tasks.some(task => task.id === value));
        if (active.length >= 3) throw new Error('Escolha até três prioridades para o dia.');
        data.priorities[day] = [...active, id];
      }
    });
  }

  checkHabit(id, day) {
    const habit = this.data.habits.find(item => item.id === id);
    if (!habit) throw new Error('Hábito não encontrado.');
    if (!dateOK(day) || day > today()) throw new Error('Você só pode marcar dias que já chegaram.');
    const marked = habit.checks.includes(day);
    if (!marked && !scheduled(habit, day)) throw new Error('Este hábito não está planejado para esse dia.');
    const checks = marked ? habit.checks.filter(value => value !== day) : [...habit.checks, day];
    this.upsert('habits', { ...habit, checks });
  }

  repeatTransactions(day = today()) {
    const due = this.data.transactions.filter(item => item.repeat && nextDate(item.date, item.repeat, item.repeatDay) <= day);
    if (!due.length) return false;
    this.change(data => {
      for (const item of due) {
        const older = data.transactions.find(record => record.id === item.id);
        older.repeat = '';
        let current = item;
        let next = nextDate(current.date, item.repeat, item.repeatDay);
        while (dateOK(next) && next <= day) {
          current = makeRecord({ ...item, date: next, repeat: '' });
          data.transactions.push(current);
          next = nextDate(current.date, item.repeat, item.repeatDay);
        }
        if (current !== item) current.repeat = item.repeat;
      }
    });
    return true;
  }

  importTransactions(items) {
    if (items.length > 10000) throw new Error('O arquivo excede 10.000 lançamentos.');
    const records = items.map((item, index) => {
      try {
        return makeRecord(clean('transactions', item));
      } catch (error) {
        throw new Error(`Lançamento ${index + 1}: ${error.message}`);
      }
    });
    this.change(data => data.transactions.push(...records));
  }

  dailyBackup(day = today()) {
    if (!this.data.settings.automaticBackups) return;
    const directory = path.join(this.dir, 'backups');
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, `backup-${day}.json`);
    if (fs.existsSync(file)) return;
    fs.writeFileSync(file + '.tmp', JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(file + '.tmp', file);
    for (const name of this.backups().slice(14)) fs.unlinkSync(path.join(directory, name));
  }

  backups() {
    const directory = path.join(this.dir, 'backups');
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory, { withFileTypes: true })
      .filter(entry => entry.isFile() && /^backup-\d{4}-\d{2}-\d{2}\.json$/.test(entry.name))
      .map(entry => entry.name).sort().reverse();
  }

  restoreBackup(data) {
    const file = path.join(this.dir, `antes-de-restaurar-${Date.now()}-${randomUUID()}.json`);
    fs.writeFileSync(file, JSON.stringify(this.data, null, 2), 'utf8');
    this.write(data);
  }
}
function streak(checks,now=new Date()) {
  const set=new Set(checks);const d=new Date(now);let count=0;
  if(!set.has(today(d)))d.setDate(d.getDate()-1);
  while(set.has(today(d))){count++;d.setDate(d.getDate()-1);}return count;
}
function dueReminders(data, now=Date.now()) {
  const due=[];
  for(const kind of ['tasks','events']) for(const item of data[kind]) {
    const day = kind === 'tasks' ? item.plannedDate ?? item.date : item.date;
    if(!item.reminder || item.done || !day || !item.time || (item.notifiedAt && !item.snoozedUntil))continue;
    const at=item.snoozedUntil || +new Date(`${day}T${item.time}:00`) - (item.reminderLead || 0) * 60000;
    if(at<=now && now-at<=86400000)due.push({kind,item});
  }
  return due;
}
module.exports={Store,initial,validateBackup,clean,today,dateOK,streak,dueReminders,setBudget,COLLECTIONS};
