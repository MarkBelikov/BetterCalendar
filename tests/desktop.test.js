const test=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const vm=require('node:vm'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const base=path.resolve(__dirname,'..');
async function desktop(options={}){
 const updater=new EventEmitter();updater.checkForUpdates=async()=>{updater.emit('update-not-available',{});return {};};updater.quitAndInstall=(...args)=>{updater.installArgs=args;};
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'better-calendar-test-'));
 const handlers={},notifications=[],events={},login={openAtLogin:true},windows=[],trayEvents={};
 const paths={appData:dir,userData:options.legacy?path.join(dir,'Better Calendar'):path.join(dir,'better-calendar')};
 if(options.legacy){fs.mkdirSync(paths.userData);fs.writeFileSync(path.join(paths.userData,'better-calendar-data.json'),JSON.stringify({journals:{'2026-10-05':'Keep my journal'},events:[],todos:[],settings:{autoLaunch:true,closeToTray:true},notified:{}}));}
 class Window {constructor(){this.shown=0;this.restored=false;this.hidden=false;this.focused=0;this.callbacks={};windows.push(this);this.webContents={setWindowOpenHandler(){},on(){},send(){}};}setAppDetails(details){this.details=details;}setMenuBarVisibility(){}loadFile(){}once(name,fn){if(name==='ready-to-show')fn();}on(name,fn){this.callbacks[name]=fn;}show(){this.shown++;this.hidden=false;}isMinimized(){return true;}restore(){this.restored=true;}focus(){this.focused++;}hide(){this.hidden=true;}}
 class Notification {static isSupported(){return true;}constructor(opts){this.opts=opts;}on(){}show(){notifications.push(this.opts);}}
 const app={isPackaged:options.packaged!==false,setName(name){this.name=name;},getVersion:()=>require('../package.json').version,getPath:name=>paths[name],setPath:(name,value)=>{paths[name]=value;},whenReady:()=>Promise.resolve(),requestSingleInstanceLock:()=>true,on:(k,f)=>{events[k]=f;},setLoginItemSettings:o=>Object.assign(login,o),getLoginItemSettings:()=>login,setAppUserModelId(){},quit(){}};
 const electron={app,BrowserWindow:Window,ipcMain:{handle:(name,fn)=>{handlers[name]=fn;}},Notification,Tray:class {setToolTip(){}setContextMenu(){}on(name,fn){trayEvents[name]=fn;}},Menu:{buildFromTemplate:x=>x},nativeImage:{createFromPath:()=>({})},dialog:{showErrorBox(){},showOpenDialog:async()=>({canceled:true}),showSaveDialog:async()=>({canceled:true})},safeStorage:{isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=> 'dpapi',encryptString:s=>Buffer.from('encrypted:'+s),decryptString:b=>b.toString().slice(10)}};
 const proc={platform:'win32',execPath:options.execPath||process.execPath};
 const ContextDate=options.now?class extends Date{constructor(...args){super(...(args.length?args:[options.now]));}static now(){return new Date(options.now).getTime();}}:Date;
 const context=vm.createContext({require:name=>name==='electron'?electron:name==='electron-updater'?{autoUpdater:updater}:require(name.startsWith('.')?path.resolve(base,name):name),process:proc,Buffer,console,structuredClone,__dirname:base,setInterval:()=>0,clearInterval(){},setTimeout:()=>0,clearTimeout(){},Date:ContextDate,JSON});
 vm.runInContext(fs.readFileSync(path.join(base,'main.js'),'utf8'),context);
 await new Promise(r=>setImmediate(r));
 const call=(name,...args)=>handlers[name]({},...args);
 return {call,dir,notifications,context,login,events,windows,trayEvents,updater,cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
test('desktop IPC preserves v1 calendar data and main-owned notification history',async()=>{
 const d=await desktop();try {
  const snapshot=await d.call('data:get');snapshot.journals['2026-10-05']='Existing journal';snapshot.todos.push({id:'x',text:'Task'});
  await d.call('data:save',snapshot);
  const file=path.join(d.dir,'better-calendar','better-calendar-data.json'),mainData=JSON.parse(fs.readFileSync(file));mainData.notified['sent']=Date.now();fs.writeFileSync(file,JSON.stringify(mainData));
  await d.call('data:save',snapshot);const result=await d.call('data:get');assert.equal(result.journals['2026-10-05'],'Existing journal');assert.equal(result.notified.sent,mainData.notified.sent);
 }finally{d.cleanup();}
});
test('reminders catch up while app is running and never call AI',async()=>{
 const d=await desktop();try {
  const now=new Date(),due=new Date(now.getTime()-60*60*1000),Core=require('../core');
  const data=await d.call('data:get');data.events=[{id:'bill',title:'Subscription',type:'subscription',date:Core.key(due),time:`${String(due.getHours()).padStart(2,'0')}:${String(due.getMinutes()).padStart(2,'0')}`,reminder:'0m',recurrence:'none'}];await d.call('data:save',data);
  vm.runInContext('checkReminders()',d.context);vm.runInContext('checkReminders()',d.context);
  assert.equal(d.notifications.length,1);assert.equal(d.notifications[0].title,'Payment reminder: Subscription');assert.equal(fs.existsSync(path.join(d.dir,'better-calendar','better-calendar-memory.json')),false);
 }finally{d.cleanup();}
});
test('calendar snapshot cannot overwrite AI memory; API key never appears in memory snapshot',async()=>{
 const d=await desktop();try {
  const c=await d.call('data:get');await d.call('memory:update',{type:'paste',title:'Cologne recommendations',text:'I like woody cologne.'});await d.call('data:save',c);
  assert.equal((await d.call('memory:get')).sources.length,1);
  await d.call('ai:configureKey','sk-fake-for-local-test');const m=await d.call('memory:get');assert.equal(m.keyConfigured,true);assert.equal(JSON.stringify(m).includes('sk-fake'),false);
  await d.call('ai:configureKey','');assert.equal((await d.call('memory:get')).keyConfigured,false);
 }finally{d.cleanup();}
});
test('turning source access off removes it from subsequent context previews',async()=>{
 const d=await desktop();try {
  let m=await d.call('memory:update',{type:'paste',title:'Cologne recommendations',text:'I like woody cologne.'});const source=m.sources[0];
  assert.equal((await d.call('ai:preview',{question:'What cologne?',shareChats:true})).body,'');
  await d.call('memory:update',{type:'source-toggle',id:source.id,enabled:true});assert.match((await d.call('ai:preview',{question:'What cologne?',shareChats:true})).body,/woody/);
  await d.call('memory:update',{type:'source-toggle',id:source.id,enabled:false});assert.equal((await d.call('ai:preview',{question:'What cologne?',shareChats:true})).body,'');
 }finally{d.cleanup();}
});
test('damaged calendar data is not silently replaced',async()=>{
 const d=await desktop();try {
  const file=path.join(d.dir,'better-calendar','better-calendar-data.json');fs.writeFileSync(file,'broken JSON');assert.throws(()=>d.call('data:get'),/not been overwritten/);assert.equal(fs.readFileSync(file,'utf8'),'broken JSON');
 }finally{d.cleanup();}
});

test('installed app registers direct startup, opens its window, and startup can be disabled',async()=>{
 const d=await desktop();try {
  assert.equal(d.login.openAtLogin,true);assert.equal(d.login.enabled,true);assert.equal(d.login.name,'com.bettercalendar.desktop');assert.equal(d.login.path,process.execPath);assert.equal(d.login.args.length,0);assert.equal(d.windows[0].shown,1);
  await d.call('settings:autoLaunch',false);assert.equal(d.login.openAtLogin,false);assert.equal(d.login.enabled,false);assert.equal((await d.call('data:get')).settings.autoLaunch,false);
 }finally{d.cleanup();}
});
test('opening an already running app restores the existing minimized window',async()=>{
 const d=await desktop();try {d.events['second-instance']();assert.equal(d.windows.length,1);assert.equal(d.windows[0].restored,true);assert.equal(d.windows[0].shown,2);}finally{d.cleanup();}
});
test('installation preserves data from the previous product-name folder',async()=>{
 const d=await desktop({legacy:true});try {assert.equal((await d.call('data:get')).journals['2026-10-05'],'Keep my journal');assert.equal(fs.existsSync(path.join(d.dir,'Better Calendar','better-calendar-data.json')),true);}finally{d.cleanup();}
});

test('Windows taskbar relaunch uses the installed exe with the branded identity',async()=>{
 const exe='C:\\Program Files\\Better Calendar\\Better Calendar.exe',d=await desktop({execPath:exe});try {
  const details=d.windows[0].details;
  assert.equal(details.appId,'com.bettercalendar.desktop');assert.equal(details.relaunchDisplayName,'Better Calendar');
  assert.equal(details.relaunchCommand,'"'+exe+'"');assert.equal(details.appIconPath,exe);
  assert.equal((await d.call('app:info')).installed,true);assert.equal((await d.call('app:info')).version,require('../package.json').version);
 }finally{d.cleanup();}
});
test('source-preview taskbar relaunch includes the project instead of opening empty Electron',async()=>{
 const d=await desktop({packaged:false});try {
  assert.equal(d.windows[0].details.relaunchCommand,'"'+process.execPath+'" "'+base+'"');
  assert.equal(d.windows[0].details.appIconPath,path.join(base,'assets','icon.ico'));
  assert.equal(d.login.args[0],base);assert.equal((await d.call('app:info')).installed,false);
 }finally{d.cleanup();}
});
test('closing to tray then clicking the taskbar or tray restores the same window',async()=>{
 const d=await desktop();try {
  const win=d.windows[0];let prevented=false;
  win.callbacks.close({preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(win.hidden,true);
  d.events['second-instance']();assert.equal(d.windows.length,1);assert.equal(win.hidden,false);assert.equal(win.restored,true);
  win.hide();d.trayEvents.click();assert.equal(win.hidden,false);assert.equal(win.focused,3);
 }finally{d.cleanup();}
});
test('a taskbar launch recreates the window after it was destroyed',async()=>{
 const d=await desktop();try {
  d.windows[0].callbacks.closed();d.events['second-instance']();assert.equal(d.windows.length,2);assert.equal(d.windows[1].shown,1);
 }finally{d.cleanup();}
});

test('tracker data survives calendar saves and reopening without any AI setup',async()=>{
 const d=await desktop();try {
  const life=await d.call('life:command',{type:'routine-add',title:'Portfolio',points:15,target:3,category:'Learning'});
  await d.call('life:command',{type:'career-save',company:'Example',role:'Full-time IT',status:'Applied',nextAction:'Recruiter follow-up'});
  const calendar=await d.call('data:get');calendar.journals['2026-10-12']='Keep this';await d.call('data:save',calendar);
  const reread=await d.call('life:get');assert.equal(reread.routines[0].id,life.routines[0].id);assert.equal(reread.applications[0].nextAction,'Recruiter follow-up');
  assert.equal((await d.call('data:get')).journals['2026-10-12'],'Keep this');assert.equal((await d.call('memory:get')).keyConfigured,false);
 }finally{d.cleanup();}
});
test('focus completion is persisted once and sends one desktop notification',async()=>{
 const d=await desktop();try {
  await d.call('life:command',{type:'focus-start',minutes:1,label:'Application'});
  const file=path.join(d.dir,'better-calendar','better-calendar-life.json'),saved=JSON.parse(fs.readFileSync(file));saved.focus.endsAt=Date.now()-1000;fs.writeFileSync(file,JSON.stringify(saved));
  await d.call('life:get');await d.call('life:get');const reread=await d.call('life:get');assert.equal(reread.focusSessions.length,1);
  assert.equal(d.notifications.filter(n=>n.title==='Focus session complete').length,1);
 }finally{d.cleanup();}
});
test('corrupt tracker files are never silently replaced by commands',async()=>{
 const d=await desktop();try {
  const file=path.join(d.dir,'better-calendar','better-calendar-life.json');fs.writeFileSync(file,'broken');
  assert.throws(()=>d.call('life:get'));assert.throws(()=>d.call('life:command',{type:'routine-starters'}));assert.equal(fs.readFileSync(file,'utf8'),'broken');
 }finally{d.cleanup();}
});

test('activity records and completed task blocks never send reminders',async()=>{
 const d=await desktop();try {
  const now=new Date(),date=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-'),time=[String(now.getHours()).padStart(2,'0'),String(now.getMinutes()).padStart(2,'0')].join(':');
  const data=await d.call('data:get');data.todos=[{id:'done',text:'Paint',completed:true}];data.events=[{id:'cancel',title:'Cancelled',date,time,type:'subscription-cancelled',recordOnly:true,reminder:'0m'},{id:'block',title:'Done task',date,time,type:'task-block',todoId:'done',reminder:'0m'}];await d.call('data:save',data);
  vm.runInContext('checkReminders()',d.context);assert.equal(d.notifications.length,0);
 }finally{d.cleanup();}
});

test('desktop updater only installs after a completed download and explicit restart',async()=>{
 const d=await desktop();try {
  assert.equal((await d.call('updates:get')).phase,'idle');assert.throws(()=>d.call('updates:restart'),/download/);
  d.updater.emit('update-downloaded',{version:'2.3.0'});assert.equal((await d.call('updates:get')).phase,'ready');assert.equal(d.updater.installArgs,undefined);
  await d.call('updates:restart');assert.deepEqual(d.updater.installArgs,[true,true]);
 }finally{d.cleanup();}
});
test('completed occurrences persist, suppress only their own notification, and retain future notifications',async()=>{
 const Core=require('../core'),d=await desktop({now:'2026-10-26T10:00:00'}),future=await desktop({now:'2026-11-26T10:00:00'});
 try{
  const data=await d.call('data:get'),e={id:'monthly',title:'Recurring reminder',type:'reminder',date:'2026-10-26',time:'10:00',recurrence:'monthly',reminder:'0m'};
  Core.setCompleted(e,e.date,true);data.events=[e];await d.call('data:save',data);
  assert.equal(Core.isCompleted((await d.call('data:get')).events[0],e.date),true);
  vm.runInContext('checkReminders()',d.context);assert.equal(d.notifications.length,0);
  await future.call('data:save',JSON.parse(JSON.stringify(data)));vm.runInContext('checkReminders()',future.context);assert.equal(future.notifications.length,1);
  Core.setCompleted(e,e.date,false);await d.call('data:save',data);vm.runInContext('checkReminders()',d.context);vm.runInContext('checkReminders()',d.context);assert.equal(d.notifications.length,1);
 }finally{d.cleanup();future.cleanup();}
});
test('full local backups retain per-date completion without including credentials',async()=>{
 const d=await desktop();try{
  const data=await d.call('data:get');data.events=[{id:'done',title:'Done',date:'2026-10-26',completedDates:{'2026-10-26':true}}];await d.call('data:save',data);await d.call('ai:configureKey','sk-fake-for-local-test');
  d.context.backupFile=path.join(d.dir,'completion-backup.json');vm.runInContext("require('electron').dialog.showSaveDialog=async()=>({canceled:false,filePath:backupFile})",d.context);
  await d.call('memory:export',true);const backup=fs.readFileSync(d.context.backupFile,'utf8');assert.equal(JSON.parse(backup).calendar.events[0].completedDates['2026-10-26'],true);assert.equal(backup.includes('sk-fake'),false);
 }finally{d.cleanup();}
});
