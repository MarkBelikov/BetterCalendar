const { app, BrowserWindow, ipcMain, Notification, Tray, Menu, nativeImage, dialog, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const Core = require('./core');
const AI = require('./ai-memory');
const Life = require('./life-core');
const {createUpdates} = require('./updates');
const APP_ID = 'com.bettercalendar.desktop';
app.setName('Better Calendar');

// Use the same data folder in the source build and installed app.
const previousUserData = app.getPath('userData');
const stableUserData = path.join(app.getPath('appData'), 'better-calendar');
if (previousUserData !== stableUserData && !fs.existsSync(path.join(stableUserData, 'better-calendar-data.json')) && fs.existsSync(path.join(previousUserData, 'better-calendar-data.json'))) {
  fs.mkdirSync(stableUserData, {recursive:true});
  for (const name of ['better-calendar-data.json','better-calendar-memory.json','better-calendar-api-key.enc']) {
    const oldFile = path.join(previousUserData,name);
    const newFile = path.join(stableUserData,name);
    if (fs.existsSync(oldFile) && !fs.existsSync(newFile)) fs.copyFileSync(oldFile,newFile);
  }
}
app.setPath('userData', stableUserData);

let aiBusy = false;
let pendingImports = [];


let mainWindow = null;
let tray = null;
let reminderTimer = null;
let focusTimer = null;
let focusRunning = false;
let updateController = createUpdates({enabled:false});
let updateTimer = null, updateStartupTimer = null;
let isQuitting = false;

const DEFAULT_DATA = {
  events: [],
  todos: [],
  journals: {},
  completions: [],
  settings: {
    autoLaunch: true,
    closeToTray: true
  },
  notified: {}
};

function dataFilePath() {
  return path.join(app.getPath('userData'), 'better-calendar-data.json');
}

function loadData() {
  const file = dataFilePath();
  try {
    if (!fs.existsSync(file)) {
      atomicWrite(file, DEFAULT_DATA);
      return JSON.parse(JSON.stringify(DEFAULT_DATA));
    }
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      ...DEFAULT_DATA,
      ...parsed,
      settings: { ...DEFAULT_DATA.settings, ...(parsed.settings || {}) },
      notified: parsed.notified || {}
    };
  } catch (error) {
    console.error('Failed to load data:', error);
    throw new Error('Your calendar data could not be read. It has not been overwritten. Restore a backup or repair better-calendar-data.json.');
  }
}

function saveData(data) {
  const file = dataFilePath();
  const safe = {
    ...DEFAULT_DATA,
    ...data,
    settings: { ...DEFAULT_DATA.settings, ...((data && data.settings) || {}) },
    notified: (data && data.notified) || {}
  };
  atomicWrite(file, safe);
  return safe;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1000,
    minHeight: 620,
    backgroundColor: '#080808',
    title: 'Better Calendar',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (process.platform === 'win32') {
    // A taskbar pin must launch this app, including its path in source previews.
    mainWindow.setAppDetails({
      appId: APP_ID,
      appIconPath: app.isPackaged ? process.execPath : path.join(__dirname, 'assets', 'icon.ico'),
      appIconIndex: 0,
      relaunchCommand: `"${process.execPath}"${app.isPackaged ? '' : ` "${__dirname}"`}`,
      relaunchDisplayName: 'Better Calendar'
    });
  }

  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('close', (event) => {
    const data = loadData();
    if (!isQuitting && data.settings.closeToTray && tray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function openWindow() {
  if (!mainWindow) {createWindow();return;}
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, 'assets', 'icon.png');
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon);
    tray.setToolTip('Better Calendar');
    tray.setContextMenu(Menu.buildFromTemplate([
      {
        label: 'Open Better Calendar',
        click: openWindow
      },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]));
    tray.on('click', openWindow);
    tray.on('double-click', openWindow);
  } catch (error) {
    console.error('Tray creation failed:', error);
  }
}

function recurrenceOccurrences(event, now, horizonEnd, todos) {
  return Core.occurrences(event, new Date(now.getTime() - Core.dayMs), horizonEnd, {todos});
}

function reminderMs(value) {
  const map = {
    '7d': 7 * 24 * 60 * 60 * 1000,
    '3d': 3 * 24 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
    '2h': 2 * 60 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '0m': 0
  };
  return map[value] ?? map['1d'];
}

function formatDue(when) {
  return when.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function checkReminders() {
  const data = loadData();
  const now = new Date();
  const horizon = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);
  let changed = false;

  for (const event of data.events || []) {
    if (event.recordOnly || ['subscription-cancelled','subscription-renewed'].includes(event.type)) continue;
    if(event.type==='task-block'&&!data.todos.some(t=>t.id===event.todoId&&!t.completed))continue;
    const lead = reminderMs(event.reminder || '1d');
    const occurrences = recurrenceOccurrences(event, now, horizon, data.todos);

    for (const due of occurrences) {
      const notifyAt = due.getTime() - lead;
      const windowStart = due.getTime() + Core.dayMs;
      const occurrenceKey = `${event.id}:${due.toISOString()}:${event.reminder || '1d'}`;

      if (now.getTime() >= notifyAt && now.getTime() <= windowStart && !data.notified[occurrenceKey]) {
        let body = `Due ${formatDue(due)}`;
        if (event.amount) body += ` • $${Number(event.amount).toFixed(2)}`;
        if (event.notes) body += `\n${event.notes}`;

        if (Notification.isSupported()) {
          const notification = new Notification({
            title: event.type === 'subscription' ? `Payment reminder: ${event.title}` : event.title,
            body,
            silent: false
          });
          notification.on('click', openWindow);
          notification.show();
        }

        data.notified[occurrenceKey] = Date.now();
        changed = true;
      }
    }
  }

  // Keep notification history bounded.
  const cutoff = Date.now() - 120 * 24 * 60 * 60 * 1000;
  for (const [key, timestamp] of Object.entries(data.notified || {})) {
    if (timestamp < cutoff) {
      delete data.notified[key];
      changed = true;
    }
  }

  if (changed) saveData(data);
}

const ownsLock = app.requestSingleInstanceLock();
if (!ownsLock) app.quit();
app.on('second-instance', openWindow);
if (ownsLock) app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId(APP_ID);
  let initial;
  try {initial = loadData();}
  catch(error) {dialog.showErrorBox('Better Calendar',error.message);app.quit();return;}
  app.setLoginItemSettings({
    name: 'com.bettercalendar.desktop',
    enabled: Boolean(initial.settings.autoLaunch),
    openAtLogin: Boolean(initial.settings.autoLaunch),
    path: process.execPath,
    args: app.isPackaged ? [] : [__dirname]
  });

  createWindow();
  createTray();
  checkReminders();
  reminderTimer = setInterval(() => {try {checkReminders();} catch(error) {console.error('Reminder check failed:',error.message);}}, 60 * 1000);
  try {readLife();} catch(error) {console.error('Trackers could not load:',error.message);}
  focusTimer = setInterval(() => {try {if(focusRunning)readLife();} catch(error) {console.error('Focus check failed:',error.message);}}, 1000);

  if(app.isPackaged && process.platform==='win32') {
    try {
      updateController=createUpdates({updater:require('electron-updater').autoUpdater,onChange:status=>{
        if(mainWindow)mainWindow.webContents.send('updates:status',status);
        if(status.phase==='ready'&&Notification.isSupported()) {
          const n=new Notification({title:'Better Calendar update ready',body:'Restart the app to install version '+status.version+'. Your PC does not need a restart.'});
          n.on('click',openWindow);n.show();
        }
      }});
      updateStartupTimer=setTimeout(()=>updateController.check(),15000);
      updateTimer=setInterval(()=>updateController.check(),6*60*60*1000);
    }catch(error){console.error('Updater unavailable:',error.message);}
  }
  app.on('activate', openWindow);
});

app.on('before-quit', () => {
  clearInterval(focusTimer);
  clearInterval(updateTimer);clearTimeout(updateStartupTimer);
  isQuitting = true;
  if (reminderTimer) clearInterval(reminderTimer);
});

app.on('window-all-closed', () => {
  // Keep running in the tray on Windows/macOS.
  if (process.platform === 'linux' || !tray) app.quit();
});

ipcMain.handle('data:get', () => loadData());

ipcMain.handle('data:save', (_event, data) => {
  const current = loadData();
  const saved = saveData({...current, events: data.events, todos: data.todos, journals: data.journals, completions: data.completions || [], settings: {...current.settings,...data.settings}});
  return saved;
});

ipcMain.handle('settings:autoLaunch', (_event, enabled) => {
  app.setLoginItemSettings({
    name: 'com.bettercalendar.desktop',
    enabled: Boolean(enabled),
    openAtLogin: Boolean(enabled),
    path: process.execPath,
    args: app.isPackaged ? [] : [__dirname]
  });
  const data = loadData();
  data.settings.autoLaunch = Boolean(enabled);
  saveData(data);
  return app.getLoginItemSettings({path:process.execPath,args:app.isPackaged ? [] : [__dirname]}).openAtLogin;
});

ipcMain.handle('settings:getAutoLaunch', () => {
  return app.getLoginItemSettings({path:process.execPath,args:app.isPackaged ? [] : [__dirname]}).openAtLogin;
});

ipcMain.handle('app:showNotification', (_event, title, body) => {
  if (!Notification.isSupported()) return false;
  new Notification({ title: String(title || 'Better Calendar'), body: String(body || '') }).show();
  return true;
});

ipcMain.handle('updates:get',()=>updateController.snapshot());
ipcMain.handle('updates:check',()=>updateController.check());
ipcMain.handle('updates:restart',()=>{noBusy();if(updateController.snapshot().phase!=='ready')throw new Error('Wait for the update to download first.');isQuitting=true;try{updateController.restart();return true;}catch(error){isQuitting=false;throw error;}});

ipcMain.handle('app:info', () => ({version: app.getVersion(), installed: app.isPackaged}));

ipcMain.handle('app:quit', () => {
  isQuitting = true;
  app.quit();
  return true;
});

// Memory and credentials live outside the renderer's calendar snapshot.
function atomicWrite(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive:true});
  fs.writeFileSync(file+'.tmp', JSON.stringify(value,null,2), {encoding:'utf8',mode:0o600});
  fs.renameSync(file+'.tmp',file);
}
const lifePath = () => path.join(app.getPath('userData'),'better-calendar-life.json');
function readLife() {
  const value=Life.normalize(fs.existsSync(lifePath())?JSON.parse(fs.readFileSync(lifePath(),'utf8')):{});
  if(Life.settle(value)) {
    atomicWrite(lifePath(),value);
    if(Notification.isSupported()) {
      const notification=new Notification({title:'Focus session complete',body:value.focus.label+' — take a moment to reset.'});
      notification.on('click',openWindow);notification.show();
    }
  }
  focusRunning=value.focus.running;
  return value;
}
ipcMain.handle('life:get', () => readLife());
ipcMain.handle('life:command', (_e,command) => {
  const value=Life.command(readLife(),command,Date.now(),()=>require('crypto').randomUUID());
  atomicWrite(lifePath(),value);focusRunning=value.focus.running;return value;
});
const memoryPath = () => path.join(app.getPath('userData'),'better-calendar-memory.json');
function memoryData() {
  if (!fs.existsSync(memoryPath())) return structuredClone(AI.DEFAULT_MEMORY);
  // Never overwrite a damaged memory file with an empty archive.
  const value = JSON.parse(fs.readFileSync(memoryPath(),'utf8'));
  return {...structuredClone(AI.DEFAULT_MEMORY),...value};
}
const writeMemory = value => atomicWrite(memoryPath(), value);
const secretPath = () => path.join(app.getPath('userData'),'better-calendar-api-key.enc');
function getKey() {
  if (!fs.existsSync(secretPath())) return '';
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure credential storage is unavailable on this computer.');
  return safeStorage.decryptString(fs.readFileSync(secretPath()));
}
function publicMemory() {
  const m = memoryData();
  return {...m,keyConfigured:fs.existsSync(secretPath()),model:AI.MODEL};
}
function noBusy() { if (aiBusy) throw new Error('Wait for the current AI answer before changing memory or settings.'); }
ipcMain.handle('memory:get', () => publicMemory());
ipcMain.handle('memory:update', (_e, command) => {
  noBusy(); const m=memoryData();
  if (command.type==='profile') m.profile=String(command.text || '').slice(0,10000);
  else if (command.type==='limit') {
    const n=Number(command.value);
    if (!Number.isInteger(n)||n<1||n>1000) throw new Error('Choose a monthly request limit between 1 and 1000.');
    m.requestLimit=n;
  } else if (command.type==='source-toggle') {
    const s=m.sources.find(s=>s.id===command.id)||m.threads.find(s=>s.id===command.id);
    if (s) s.aiEnabled=Boolean(command.enabled);
  } else if (command.type==='delete-source') {
    m.sources=m.sources.filter(s=>s.id!==command.id); m.threads=m.threads.filter(t=>t.id!==command.id);
  } else if (command.type==='paste') {
    const body=String(command.text||'').trim();
    if (!body || body.length>500000) throw new Error('Paste a chat up to 500,000 characters.');
    m.sources.push({id:require('crypto').randomUUID(),title:String(command.title||'Pasted conversation').slice(0,200),text:body,origin:'Pasted text',aiEnabled:false});
  } else throw new Error('Unknown memory action.');
  writeMemory(m); return publicMemory();
});
ipcMain.handle('memory:chooseImport', async () => {
  noBusy(); const selection=await dialog.showOpenDialog(mainWindow,{title:'Import conversations.json or a chat text file',properties:['openFile'],filters:[{name:'Chat history',extensions:['json','txt','md']}]});
  if (selection.canceled) return [];
  const file=selection.filePaths[0];
  if (fs.statSync(file).size>50*1024*1024) throw new Error('Choose a file under 50 MB.');
  pendingImports=AI.parseImport(fs.readFileSync(file,'utf8'),path.basename(file));
  return pendingImports.map(s=>({id:s.id,title:s.title,length:s.text.length}));
});
ipcMain.handle('memory:confirmImport', (_e, ids) => {
  noBusy(); const chosen=new Set(ids),m=memoryData();
  const hashes=new Set(m.sources.map(s=>s.fingerprint).filter(Boolean)); let added=0;
  for (const s of pendingImports) if(chosen.has(s.id)&&!hashes.has(s.fingerprint)) { m.sources.push(s);hashes.add(s.fingerprint);added++; }
  pendingImports=[]; writeMemory(m); return {memory:publicMemory(),added};
});
ipcMain.handle('ai:configureKey', (_e, key) => {
  noBusy(); if (!key) { if(fs.existsSync(secretPath())) fs.unlinkSync(secretPath());return false; }
  if (typeof key!=='string'||key.length>500||!key.startsWith('sk-')) throw new Error('Enter an OpenAI API key beginning with sk-.');
  if (!safeStorage.isEncryptionAvailable() || (process.platform==='linux' && safeStorage.getSelectedStorageBackend()==='basic_text')) throw new Error('Secure credential storage is unavailable. Your key was not saved.');
  fs.writeFileSync(secretPath(),safeStorage.encryptString(key.trim()),{mode:0o600}); return true;
});
ipcMain.handle('ai:preview', (_e, request) => AI.context(memoryData(),{...loadData(),life:readLife()},request));
ipcMain.handle('ai:ask', async (_e, request) => {
  noBusy(); aiBusy=true;
  try { return await AI.ask({memory:memoryData(),data:{...loadData(),life:readLife()},request,apiKey:getKey(),writeMemory}); }
  finally {aiBusy=false;}
});
ipcMain.handle('memory:export', async (_e, fullBackup) => {
  noBusy(); const result=await dialog.showSaveDialog(mainWindow,{defaultPath:fullBackup?'BetterCalendar_Backup.json':'BetterCalendar_Context.md',filters:[{name:fullBackup?'JSON backup':'Markdown context',extensions:[fullBackup?'json':'md']}]});
  if(result.canceled) return false;
  const m=memoryData();
  if (fullBackup) atomicWrite(result.filePath,{format:'BetterCalendar backup v3',calendar:loadData(),life:readLife(),memory:m});
  else fs.writeFileSync(result.filePath,'# Better Calendar context\n\n'+m.profile+'\n\n'+m.sources.filter(s=>s.aiEnabled).map(s=>'## '+s.title+'\n'+s.text).join('\n\n')+'\n\n'+m.threads.filter(t=>t.aiEnabled!==false).map(t=>'## '+t.title+'\n'+t.messages.map(x=>x.role+': '+x.text).join('\n\n')).join('\n\n'),'utf8');
  return true;
});
