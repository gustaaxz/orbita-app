'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const call=async(channel,...args)=>{const result=await ipcRenderer.invoke(channel,...args);if(!result.ok)throw new Error(result.error);return result.value;};
const listen=(channel,callback)=>{const listener=(_event,payload)=>callback(payload);ipcRenderer.on(channel,listener);return ()=>ipcRenderer.removeListener(channel,listener);};
contextBridge.exposeInMainWorld('orbita',{
  read:()=>call('read'),
  upsert:(kind,item)=>call('upsert',kind,item),
  remove:(kind,id)=>call('remove',kind,id),
  restoreItem:(kind,id)=>call('restore-item',kind,id),
  priority:(id,day)=>call('priority',id,day),
  checkHabit:(id,date)=>call('habit-check',id,date),
  settings:settings=>call('settings',settings),
  startup:enabled=>call('startup',enabled),
  focus:(action,options)=>call('focus',action,options),
  export:()=>call('export'),import:()=>call('import'),
  dataFolder:()=>call('data-folder'),testNotification:()=>call('notification-test'),quit:()=>call('quit'),
  backups:()=>call('backups'),restoreDaily:(name,source)=>call('restore-daily',name,source),
  chooseBackup:()=>call('backup-choose'),clearBackup:()=>call('backup-clear'),retryBackup:()=>call('backup-try'),
  budget:(category,amount)=>call('budget',category,amount),importCsv:()=>call('import-csv'),
  update:action=>call('update',action),
  onUpdate:callback=>listen('update-state',callback),
  onCapture:callback=>listen('quick-capture',callback),
  onOpenRecord:callback=>listen('open-record',callback),
  onChange:callback=>listen('changed',callback)
});
