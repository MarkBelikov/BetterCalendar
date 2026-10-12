// Local tracking rules shared by the desktop process and interface.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./core'));else root.LifeCore=factory(root.CalendarCore);})(typeof globalThis!=='undefined'?globalThis:this,function(Core){
 'use strict';
 const DEFAULT={schema:1,routines:[],routineLogs:{},applications:[],weeklyReviews:{},focus:{running:false,remainingMs:1500000,durationMs:1500000,endsAt:null,label:'Focused work'},focusSessions:[]};
 const categories=['Career','Learning','Fitness','Personal','Hobbies'];
 const statuses=['Saved','Applied','Interview','Offer','Closed'];
 const templates=[
  {title:'Tailor and submit an application',category:'Career',points:15,target:3},
  {title:'Follow up with a professional contact',category:'Career',points:10,target:2},
  {title:'Build a skill or portfolio project',category:'Learning',points:15,target:3},
  {title:'Move, train or take a walk',category:'Fitness',points:10,target:3},
  {title:'Reflect on the day',category:'Personal',points:5,target:5},
  {title:'Make time for a hobby or a friend',category:'Hobbies',points:5,target:2},
  {title:'Spent 3 hours scrolling',category:'Personal',points:-25,target:1}
 ];
 const clone=x=>JSON.parse(JSON.stringify(x));
 const clean=(v,n)=>String(v??'').trim().slice(0,n);
 const dateOK=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Core.key(Core.parse(s))===s;
 function normalize(raw={}){return {...clone(DEFAULT),...raw,focus:{...DEFAULT.focus,...raw.focus}};}
 function weekKey(date){const d=typeof date==='string'?Core.parse(date):new Date(date);d.setDate(d.getDate()-((d.getDay()+6)%7));return Core.key(d);}
 function days(week){const d=Core.parse(week);return Array.from({length:7},(_,i)=>{const x=new Date(d);x.setDate(x.getDate()+i);return Core.key(x);});}
 function weekly(data,week=weekKey(new Date())){
  const keys=days(week),logs=keys.flatMap(k=>Object.values(data.routineLogs[k]||{}));
  const sessions=data.focusSessions.filter(s=>keys.includes(s.date));
  return {week,keys,points:logs.reduce((n,l)=>n+l.points,0),positiveActions:logs.filter(l=>l.points>=0).length,focusMinutes:sessions.reduce((n,s)=>n+s.minutes,0),routineCounts:Object.fromEntries(data.routines.map(r=>[r.id,keys.filter(k=>data.routineLogs[k]?.[r.id]).length]))};
 }
 function remaining(data,now=Date.now()){return Math.max(0,data.focus.running?data.focus.endsAt-now:data.focus.remainingMs);}
 function settle(data,now=Date.now()){
  const f=data.focus;if(!f.running||f.endsAt>now)return false;
  if(!data.focusSessions.some(s=>s.id===f.id)) data.focusSessions.push({id:f.id,label:f.label,minutes:f.durationMs/60000,date:Core.key(new Date(f.endsAt)),completedAt:new Date(f.endsAt).toISOString()});
  data.focus={...f,running:false,remainingMs:0,endsAt:null};return true;
 }
 function command(data,cmd,now=Date.now(),makeId=()=>globalThis.crypto.randomUUID()){
  settle(data,now);const type=cmd?.type;
  if(type==='routine-add'){
   const title=clean(cmd.title,120),points=Number(cmd.points),target=Number(cmd.target);
   if(!title||!Number.isInteger(points)||points< -100||points>100||!Number.isInteger(target)||target<1||target>7)throw new Error('Add a title, points from -100 to 100, and a weekly target from 1 to 7.');
   data.routines.push({id:makeId(),title,points,target,category:categories.includes(cmd.category)?cmd.category:'Personal',archived:false});
  }else if(type==='routine-starters'){
   for(const t of templates)if(!data.routines.some(r=>r.title===t.title))data.routines.push({...t,id:makeId(),archived:false});
  }else if(type==='routine-archive'){
   const r=data.routines.find(r=>r.id===cmd.id);if(!r)throw new Error('Routine not found.');r.archived=Boolean(cmd.archived);
  }else if(type==='routine-toggle'){
   const r=data.routines.find(r=>r.id===cmd.id),day=cmd.date;
   if(!r||r.archived||!dateOK(day)||day>Core.key(new Date(now)))throw new Error('Choose an active routine and a date up to today.');
   const logs=data.routineLogs[day]||(data.routineLogs[day]={});
   if(logs[r.id])delete logs[r.id];else logs[r.id]={title:r.title,points:r.points,category:r.category};
  }else if(type==='career-save'){
   const company=clean(cmd.company,120),role=clean(cmd.role,120);
   if(!company||!role||!statuses.includes(cmd.status)||cmd.followUpDate&&!dateOK(cmd.followUpDate))throw new Error('Add a company/contact, role/purpose, valid status and follow-up date.');
   let item=cmd.id?data.applications.find(a=>a.id===cmd.id):null;
   if(cmd.id&&!item)throw new Error('Career entry not found.');
   if(!item){item={id:makeId(),createdAt:new Date(now).toISOString()};data.applications.push(item);}
   Object.assign(item,{company,role,status:cmd.status,kind:cmd.kind==='Outreach'?'Outreach':'Application',source:clean(cmd.source,120),nextAction:clean(cmd.nextAction,200),followUpDate:cmd.followUpDate||'',notes:clean(cmd.notes,3000)});
  }else if(type==='review-save'){
   if(!dateOK(cmd.week)||weekKey(cmd.week)!==cmd.week)throw new Error('Choose a week beginning on Monday.');
   data.weeklyReviews[cmd.week]={wins:clean(cmd.wins,3000),improve:clean(cmd.improve,3000),next:clean(cmd.next,3000)};
  }else if(type==='focus-start'){
   const minutes=Number(cmd.minutes);if(data.focus.running)throw new Error('Pause or reset the current timer first.');
   if(!Number.isInteger(minutes)||minutes<1||minutes>180)throw new Error('Choose 1 to 180 minutes.');
   data.focus={id:makeId(),label:clean(cmd.label,120)||'Focused work',durationMs:minutes*60000,remainingMs:minutes*60000,running:true,endsAt:now+minutes*60000};
  }else if(type==='focus-pause'){
   if(data.focus.running)data.focus={...data.focus,remainingMs:remaining(data,now),running:false,endsAt:null};
  }else if(type==='focus-resume'){
   if(data.focus.running||!data.focus.id||data.focus.remainingMs<=0)throw new Error('Start a new session first.');
   data.focus={...data.focus,running:true,endsAt:now+data.focus.remainingMs};
  }else if(type==='focus-reset')data.focus=clone(DEFAULT.focus);
  else throw new Error('Unknown tracking action.');
  return data;
 }
 return {DEFAULT,normalize,weekKey,days,weekly,remaining,settle,command,templates,categories,statuses,dateOK};
});
