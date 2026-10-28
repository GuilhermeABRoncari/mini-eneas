const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  hide: () => ipcRenderer.send('mini:minimize'),
  quit: () => ipcRenderer.send('mini:quit'),
  panel: open => { if (typeof open === 'boolean') ipcRenderer.send('mini:panel', open); },
});
contextBridge.exposeInMainWorld('eneasAi',{
  settings:()=>ipcRenderer.invoke('mini:ai-settings'),
  save:value=>ipcRenderer.invoke('mini:ai-save',value),
  models:()=>ipcRenderer.invoke('mini:ai-models'),
  start:(id,text)=>ipcRenderer.invoke('mini:ai-start',id,text),
  cancel:id=>ipcRenderer.invoke('mini:ai-cancel',id),
  clear:()=>ipcRenderer.invoke('mini:ai-clear'),
  onEvent:callback=>{
    if(typeof callback!=='function')return ()=>{};
    const listener=(_event,value)=>callback(value);ipcRenderer.on('mini:ai-event',listener);
    return ()=>ipcRenderer.removeListener('mini:ai-event',listener);
  },
});

contextBridge.exposeInMainWorld('eneasAudio', {
  command: value => ipcRenderer.invoke('mini:audio-command', value),
  onEvent: callback => {
    if(typeof callback !== 'function') return () => {};
    const listener=(_event,value)=>callback(value);
    ipcRenderer.on('mini:audio-event',listener);
    return ()=>ipcRenderer.removeListener('mini:audio-event',listener);
  },
});
