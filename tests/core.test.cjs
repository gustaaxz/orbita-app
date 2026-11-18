'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Store,initial,validateBackup,clean,today,dateOK,streak,dueReminders}=require('../app/core.cjs');
const dir=path.join(__dirname,'scratch');fs.mkdirSync(dir,{recursive:true});
function store(){return new Store(fs.mkdtempSync(path.join(dir,'store-')));}
test('real dates, local leap days, time and reminder validation',()=>{
  assert.equal(dateOK('2024-02-29'),true);assert.equal(dateOK('2025-02-29'),false);assert.equal(dateOK('2026-04-31'),false);
  assert.throws(()=>clean('tasks',{title:'Teste',reminder:true}),/data e horário/);
  assert.throws(()=>clean('events',{title:'Teste',date:'2026-10-31',time:'15:00',endTime:'14:59'}),/término/);
  assert.throws(()=>clean('tasks',{title:'Teste',time:'10:00'}),/data do horário/);
});
test('CRUD survives restart and deleting project keeps its tasks',()=>{
  const s=store();const p=s.upsert('projects',{title:'Reforma'});let t=s.upsert('tasks',{title:'Comprar tinta',projectId:p.id});
  t=s.upsert('tasks',{...t,done:true});assert.equal(new Store(s.dir).data.tasks[0].done,true);
  s.remove('projects',p.id);assert.equal(s.data.tasks[0].projectId,'');assert.equal(s.data.tasks.length,1);
  s.remove('tasks',t.id);assert.equal(new Store(s.dir).data.tasks.length,0);
  assert.throws(()=>s.upsert('tasks',{...t,title:'Fantasma'}),/não existe/);
});
test('corruption recovery preserves damaged file and good backup',()=>{
  const s=store();s.upsert('notes',{title:'Primeira',content:'Texto'});s.upsert('notes',{title:'Segunda',content:'Texto 2'});
  fs.writeFileSync(s.file,'invalid-json');const recovered=new Store(s.dir);
  assert.equal(recovered.recovered,true);assert.equal(recovered.data.notes[0].title,'Primeira');assert.equal(recovered.data.notes.length,1);
  assert.ok(fs.readdirSync(s.dir).some(x=>x.startsWith('dados-danificados')));
  recovered.upsert('notes',{title:'Depois'});assert.equal(new Store(s.dir).data.notes.length,2);
});
test('unrecoverable data is never silently reset',()=>{
  const s=store();fs.writeFileSync(s.file,'broken');fs.writeFileSync(s.file+'.bak','broken-backup');
  assert.throws(()=>new Store(s.dir),/preservados/);assert.equal(fs.readFileSync(s.file,'utf8'),'broken');
});
test('backup validation rejects invalid amounts, duplicates and invalid shape',()=>{
  assert.throws(()=>validateBackup({schema:9}),/backup válido/);
  const s=store();const t=s.upsert('transactions',{title:'Almoço',date:'2026-10-31',amount:3590,type:'expense'});
  assert.equal(new Store(s.dir).data.transactions[0].amount,3590);
  assert.throws(()=>clean('transactions',{title:'X',date:'2026-10-31',amount:-100}),/intervalo/);
  const invalid=structuredClone(s.data);invalid.transactions.push(t);assert.throws(()=>validateBackup(invalid),/duplicados/);
  const before=JSON.stringify(s.data);assert.throws(()=>s.upsert('transactions',{title:'X',amount:0}));assert.equal(JSON.stringify(s.data),before);
});
test('daily streak handles today, yesterday and gaps',()=>{
  const now=new Date(2026,9,31,12);assert.equal(today(now),'2026-10-31');
  assert.equal(streak(['2026-10-29','2026-10-30','2026-10-31'],now),3);
  assert.equal(streak(['2026-10-29','2026-10-30'],now),2);
  assert.equal(streak(['2026-10-28','2026-10-30'],now),1);
  assert.equal(streak(['2026-10-29'],now),0);
});
test('reminders catch due items once, skip completed, future and older than a day',()=>{
  const data=initial();const now=+new Date('2026-10-31T12:00:00');
  data.tasks=[{id:'1',title:'Due',reminder:true,date:'2026-10-31',time:'11:59'},{id:'2',reminder:true,date:'2026-10-31',time:'12:01'},{id:'3',reminder:true,date:'2026-10-29',time:'12:00'},{id:'4',reminder:true,date:'2026-10-31',time:'10:00',done:true},{id:'5',reminder:true,date:'2026-10-31',time:'10:00',notifiedAt:'yes'}];
  assert.deepEqual(dueReminders(data,now).map(x=>x.item.id),['1']);
});
test('restoring backup preserves all collections but stops active focus',()=>{
  const s=store();for(const [kind,values] of Object.entries({tasks:{title:'T'},events:{title:'E',date:'2026-10-31'},projects:{title:'P'},goals:{title:'G',target:5,current:1},habits:{title:'H',checks:['2026-10-31']},transactions:{title:'F',amount:100,date:'2026-10-31'},notes:{title:'N',content:'<script>sample</script>'}}))s.upsert(kind,values);
  s.change(d=>{d.focus={title:'Teste',minutes:25,remaining:1500,endsAt:Date.now()+1500000,status:'running'};});
  assert.equal(new Store(s.dir).data.focus.status,'running');const restored=validateBackup(s.data);assert.equal(restored.focus,null);assert.equal(restored.notes[0].content,'<script>sample</script>');
  for(const k of ['tasks','events','projects','goals','habits','transactions','notes'])assert.equal(restored[k].length,1);
});
