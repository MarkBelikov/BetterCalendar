const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{createUpdates}=require('../updates');
function fixture(){const peer=new EventEmitter();let checks=0,installs=[];peer.checkForUpdates=async()=>{checks++;peer.emit('checking-for-update');peer.emit('update-not-available');return {};};peer.quitAndInstall=(...args)=>installs.push(args);const updates=createUpdates({updater:peer});return {peer,updates,checks:()=>checks,installs};}
test('checks do not install and normal app quit is not configured to auto-install',async()=>{
 const d=fixture();assert.equal(d.peer.autoDownload,true);assert.equal(d.peer.autoInstallOnAppQuit,false);assert.equal(d.peer.allowDowngrade,false);await d.updates.check();assert.equal(d.checks(),1);assert.equal(d.updates.snapshot().phase,'idle');assert.equal(d.installs.length,0);
});
test('download states expose progress, but only a completed download can restart',()=>{
 const d=fixture();assert.throws(()=>d.updates.restart(),/finished downloading/);
 d.peer.emit('update-available',{version:'2.3.0'});d.peer.emit('download-progress',{percent:52.6});assert.equal(d.updates.snapshot().percent,53);assert.throws(()=>d.updates.restart());
 d.peer.emit('update-downloaded',{version:'2.3.0'});assert.equal(d.installs.length,0);d.updates.restart();assert.deepEqual(d.installs,[[true,true]]);assert.equal(d.updates.snapshot().phase,'installing');
});
test('failed update downloads never expose a ready-to-install state',()=>{
 const d=fixture();d.peer.emit('update-available',{version:'2.3.0'});d.peer.emit('error',new Error('Checksum mismatch'));assert.equal(d.updates.snapshot().phase,'error');assert.throws(()=>d.updates.restart());assert.equal(d.installs.length,0);
});
test('source previews make no update requests',async()=>{
 let calls=0;const d=createUpdates({enabled:false,updater:{checkForUpdates:()=>calls++}});await d.check();assert.equal(calls,0);assert.equal(d.snapshot().phase,'unsupported');assert.throws(()=>d.restart());
});
test('checks during a pending download or ready update do not replace its state',async()=>{
 const d=fixture();d.peer.emit('update-available',{version:'2.3.0'});await d.updates.check();assert.equal(d.checks(),0);d.peer.emit('update-downloaded',{version:'2.3.0'});await d.updates.check();assert.equal(d.checks(),0);assert.equal(d.updates.snapshot().phase,'ready');
});
