'use strict';
// Update traffic is handled by electron-updater; no AI or personal calendar data is used.
function createUpdates({updater,enabled=true,onChange=()=>{}}) {
 let state={phase:enabled?'idle':'unsupported',message:enabled?'Updates will download in the background when a release is available.':'Automatic updates require the installed Windows app.',version:'',percent:0};
 const snapshot=()=>({...state});
 const set=patch=>{state={...state,...patch};onChange(snapshot());};
 if(enabled){
  updater.autoDownload=true;
  updater.autoInstallOnAppQuit=false;
  updater.allowPrerelease=false;
  updater.allowDowngrade=false;
  updater.logger=null;
  updater.on('checking-for-update',()=>set({phase:'checking',message:'Checking for updates…',percent:0}));
  updater.on('update-not-available',()=>set({phase:'idle',message:'You have the latest published version.',version:'',percent:0}));
  updater.on('update-available',info=>set({phase:'downloading',message:`Downloading version ${info.version}…`,version:info.version,percent:0}));
  updater.on('download-progress',progress=>set({phase:'downloading',percent:Math.min(100,Math.max(0,Math.round(progress.percent||0)))}));
  updater.on('update-downloaded',info=>set({phase:'ready',version:info.version,percent:100,message:`Version ${info.version} is ready. Restart Better Calendar to update.`}));
  updater.on('error',()=>set({phase:'error',message:'Updates are unavailable right now. Check your internet connection or try again later.',percent:0}));
 }
 async function check(){
  if(!enabled||['checking','downloading','ready','installing'].includes(state.phase))return snapshot();
  set({phase:'checking',message:'Checking for updates…',percent:0});
  try {const result=await updater.checkForUpdates();result?.downloadPromise?.catch(()=>{});if(state.phase==='checking')set({phase:'idle',message:'Update check finished.'});}
  catch(_){set({phase:'error',message:'Updates are unavailable right now. Check your internet connection or try again later.',percent:0});}
  return snapshot();
 }
 function restart(){
  if(!enabled||state.phase!=='ready')throw new Error('Wait until the update has finished downloading.');
  set({phase:'installing',message:'Restarting Better Calendar to update…'});
  try {updater.quitAndInstall(true,true);}
  catch(error){set({phase:'error',message:'The update could not be installed. Try checking for updates again.'});throw error;}
 }
 return {snapshot,check,restart};
}
module.exports={createUpdates};
