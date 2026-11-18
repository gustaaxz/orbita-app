'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const call=async(channel,...args)=>{const result=await ipcRenderer.invoke(channel,...args);if(!result.ok)throw new Error(result.error);return result.value;};
contextBridge.exposeInMainWorld('orbita',{
  read:()=>call('read'),
  upsert:(kind,item)=>call('upsert',kind,item),
  remove:(kind,id)=>call('remove',kind,id),
  checkHabit:(id,date)=>call('habit-check',id,date),
  settings:settings=>call('settings',settings),
  startup:enabled=>call('startup',enabled),
  focus:(action,options)=>call('focus',action,options),
  export:()=>call('export'),import:()=>call('import'),
  dataFolder:()=>call('data-folder'),testNotification:()=>call('notification-test'),quit:()=>call('quit'),
  onChange:callback=>{const listener=(_event,payload)=>callback(payload);ipcRenderer.on('changed',listener);return ()=>ipcRenderer.removeListener('changed',listener);}
});
