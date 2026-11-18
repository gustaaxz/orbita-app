'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const COLLECTIONS = ['tasks', 'events', 'projects', 'goals', 'habits', 'transactions', 'notes', 'sessions'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const colors = ['green', 'blue', 'amber', 'rose', 'purple'];
function today(now = new Date()) { return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`; }
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
  if (['tasks','events'].includes(kind)) {
    if (o.time && !TIME_RE.test(o.time)) throw new Error('Informe um horário válido.');
    if (o.time && !o.date) throw new Error('Escolha a data do horário.');
    if (o.reminder && (!o.date || !o.time)) throw new Error('O lembrete precisa de data e horário.');
    if (kind==='events') {
      if (!o.date) throw new Error('Escolha a data do compromisso.');
      if (o.endTime && (!TIME_RE.test(o.endTime) || !o.time || o.endTime<=o.time)) throw new Error('O término deve ser depois do início, no mesmo dia.');
    }
  }
  if (kind==='transactions' && !o.date) throw new Error('Escolha a data do lançamento.');
  return o;
}
function initial() { return {schema:1, tasks:[],events:[],projects:[],goals:[],habits:[],transactions:[],notes:[],sessions:[], settings:{name:'',dark:false,closeToTray:true,notifications:true}, focus:null}; }
function validateBackup(raw) {
  if (!raw || raw.schema !== 1 || !COLLECTIONS.every(k=>Array.isArray(raw[k]))) throw new Error('Este arquivo não é um backup válido do Órbita.');
  const out=initial();
  for (const kind of COLLECTIONS) {
    if(raw[kind].length>50000) throw new Error('Backup muito grande.');
    const ids=new Set();
    out[kind]=raw[kind].map(item=>{
      const o=clean(kind,item); const id=str(item.id,80);
      if (!id || ids.has(id)) throw new Error('Backup contém registros duplicados ou sem identificação.');
      ids.add(id); return {...o,id,createdAt:str(item.createdAt,40),updatedAt:str(item.updatedAt,40),notifiedAt:str(item.notifiedAt,50)};
    });
  }
  out.settings={name:str(raw.settings?.name,60),dark:!!raw.settings?.dark,closeToTray:raw.settings?.closeToTray!==false,notifications:raw.settings?.notifications!==false};
  // A restore never starts a timer unexpectedly.
  out.focus=null;
  return out;
}
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
      if (f.status!=='running' || (Number.isFinite(f.endsAt) && f.endsAt>0)) out.focus={title:str(f.title,200),minutes:num(f.minutes,1,240),remaining:f.remaining,status:f.status,endsAt:f.endsAt || null};
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
      if(kind==='tasks' && item.projectId && !data.projects.some(p=>p.id===item.projectId)) throw new Error('O projeto não existe mais.');
      const old=index>=0?data[kind][index]:null;
      result={...item,id:old?.id || randomUUID(),createdAt:old?.createdAt || new Date().toISOString(),updatedAt:new Date().toISOString(),notifiedAt:old && old.date===item.date && old.time===item.time && old.reminder===item.reminder?old.notifiedAt||'':''};
      if(index>=0)data[kind][index]=result;else data[kind].push(result);
    }); return result;
  }
  remove(kind,id) {
    if(!COLLECTIONS.includes(kind) || kind==='sessions') throw new Error('Tipo de registro inválido.');
    this.change(data=>{data[kind]=data[kind].filter(x=>x.id!==id); if(kind==='projects') data.tasks.forEach(t=>{if(t.projectId===id)t.projectId='';});});
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
    if(!item.reminder || item.notifiedAt || item.done || !item.date || !item.time)continue;
    const at=+new Date(`${item.date}T${item.time}:00`);
    if(at<=now && now-at<=86400000)due.push({kind,item});
  }
  return due;
}
module.exports={Store,initial,validateBackup,clean,today,dateOK,streak,dueReminders,COLLECTIONS};
