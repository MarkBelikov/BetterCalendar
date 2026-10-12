const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('calendarAPI', {
  getUpdates: () => ipcRenderer.invoke('updates:get'),
  checkUpdates: () => ipcRenderer.invoke('updates:check'),
  restartForUpdate: () => ipcRenderer.invoke('updates:restart'),
  onUpdateStatus: callback => {const listener=(_event,status)=>callback(status);ipcRenderer.on('updates:status',listener);return ()=>ipcRenderer.removeListener('updates:status',listener);},
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  getLife: () => ipcRenderer.invoke('life:get'),
  updateLife: command => ipcRenderer.invoke('life:command', command),
  getMemory: () => ipcRenderer.invoke('memory:get'),
  updateMemory: command => ipcRenderer.invoke('memory:update', command),
  chooseImport: () => ipcRenderer.invoke('memory:chooseImport'),
  confirmImport: ids => ipcRenderer.invoke('memory:confirmImport', ids),
  configureKey: key => ipcRenderer.invoke('ai:configureKey', key),
  previewAI: request => ipcRenderer.invoke('ai:preview', request),
  askAI: request => ipcRenderer.invoke('ai:ask', request),
  exportMemory: backup => ipcRenderer.invoke('memory:export', backup),
  getData: () => ipcRenderer.invoke('data:get'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  setAutoLaunch: (enabled) => ipcRenderer.invoke('settings:autoLaunch', enabled),
  getAutoLaunch: () => ipcRenderer.invoke('settings:getAutoLaunch'),
  showNotification: (title, body) => ipcRenderer.invoke('app:showNotification', title, body),
  quit: () => ipcRenderer.invoke('app:quit')
});
