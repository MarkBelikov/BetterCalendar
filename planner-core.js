(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./core'));else root.PlannerCore=factory(root.CalendarCore);})(typeof globalThis!=='undefined'?globalThis:this,function(Core){
 'use strict';
 const WINDOWS={weekdayStart:'18:00',weekdayEnd:'21:00',weekendStart:'13:00',weekendEnd:'18:00'};
 const clock=s=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s)?Number(s.slice(0,2))*60+Number(s.slice(3)):NaN;
 const validWindows=w=>['weekday','weekend'].every(k=>{const a=clock(w[k+'Start']),b=clock(w[k+'End']);return Number.isFinite(a)&&Number.isFinite(b)&&a>=0&&b<=1439&&a<b;});
 function estimate(text){
  const explicit=String(text).match(/\b(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?)\b/i);
  if(explicit){const minutes=Math.round(Number(explicit[1])*(/^h/i.test(explicit[2])?60:1));if(minutes>=5&&minutes<=240)return {minutes,reason:'Uses the duration written in your task.'};}
  if(/application|apply|job\s+apps?\b|resume|recruiter|email|follow.up/i.test(text)){
   const count=String(text).match(/\b(\d+)\s+(?:job\s+)?(?:apps?|applications?)\b/i),minutes=count?Math.min(240,Math.max(30,Number(count[1])*30)):30;
   return {minutes,reason:count?'Allows about 30 minutes per application, up to a four-hour work block.':'Allows about 30 minutes for an application or follow-up.'};
  }
  if(/warhammer|paint|miniature|\bminis?\b|model|hobby/i.test(text))return {minutes:60,reason:'Allows one hour for a creative work session, including setup.'};
  if(/study|learn|portfolio|project|code|workout|gym|walk/i.test(text))return {minutes:45,reason:'A 45-minute block leaves room to get into the activity without filling the whole evening.'};
  return {minutes:25,reason:'A 25-minute starting block makes the first step easier. Adjust it if you need longer.'};
 }
 function priority(todo){
  const labels=['Urgent','Career','Essential','Normal','Hobby'];
  if(Number.isInteger(todo.planPriority)&&todo.planPriority>=0&&todo.planPriority<=4)return {rank:todo.planPriority,label:labels[todo.planPriority],reason:'Priority you selected.'};
  if(/\burgent\b|\basap\b|\boverdue\b|\bdue today\b/i.test(todo.text))return {rank:0,label:'Urgent',reason:'Urgent wording moves this ahead of other tasks.'};
  if(/application|apply|job\s+apps?\b|resume|recruiter|interview|follow.up/i.test(todo.text))return {rank:1,label:'Career',reason:'Applications and career follow-ups come before hobbies.'};
  if(/\bbill\b|\bappointment\b|\bdoctor\b|\brepair\b|\bdeadline\b/i.test(todo.text))return {rank:2,label:'Essential',reason:'A practical commitment comes before optional activities.'};
  if(/warhammer|paint|miniature|\bminis?\b|hobby|\bgam(?:e|ing)\b/i.test(todo.text))return {rank:4,label:'Hobby',reason:'Makes room for essential and career tasks first.'};
  return {rank:3,label:'Normal',reason:'A regular task, after urgent and essential work.'};
 }
 const startOf=slot=>{const d=Core.parse(slot.date),m=clock(slot.time);d.setHours(Math.floor(m/60),m%60,0,0);return d;};
 const planEnd=plan=>plan?.date&&Number.isFinite(clock(plan.time))?startOf(plan).getTime()+Number(plan.minutes)*60000:NaN;
 const reservation=plan=>({start:startOf(plan).getTime(),end:planEnd(plan)});
 function suggestions(data,todo,{now=new Date(),minutes=estimate(todo.text).minutes,reservations,limit=3}={}){
  const duration=Number(minutes);if(!Number.isInteger(duration)||duration<5||duration>240)return [];
  const raw=data.settings?.availability||WINDOWS,w=validWindows(raw)?raw:WINDOWS,slots=[];
  const reserved=reservations||(data.todos||[]).filter(t=>!t.completed&&t.id!==todo.id&&t.plan?.date&&planEnd(t.plan)>now.getTime()).map(t=>reservation(t.plan));
  for(let offset=0;offset<14&&slots.length<limit;offset++){
   const day=new Date(now.getFullYear(),now.getMonth(),now.getDate()+offset),endDay=new Date(day);endDay.setHours(23,59,59,999);
   const kind=[0,6].includes(day.getDay())?'weekend':'weekday',startMinute=clock(w[kind+'Start']),endMinute=clock(w[kind+'End']);
   const busy=[...reserved,...(data.events||[]).filter(e=>!e.recordOnly&&!['subscription-cancelled','subscription-renewed'].includes(e.type)&&e.todoId!==todo.id&&!(e.type==='task-block'&&!(data.todos||[]).some(t=>t.id===e.todoId&&!t.completed))).flatMap(e=>Core.occurrences(e,day,endDay,{todos:data.todos}).map(start=>({start:start.getTime(),end:start.getTime()+Number(e.durationMinutes||30)*60000})))];
   for(let m=startMinute;m+duration<=endMinute;m+=15){
    const start=new Date(day);start.setHours(Math.floor(m/60),m%60,0,0);const finish=start.getTime()+duration*60000;
    if(start.getTime()<now.getTime()+30*60000||busy.some(b=>start.getTime()<b.end&&finish>b.start))continue;
    slots.push({date:Core.key(start),time:`${String(start.getHours()).padStart(2,'0')}:${String(start.getMinutes()).padStart(2,'0')}`,minutes:duration});break;
   }
  }
  return slots;
 }
 // Recommendations live on the permanent list; calendar blocks are created only on acceptance.
 // Missed deadlines never roll forward unless the user explicitly asks to replan that task.
 function planTasks(data,{now=new Date(),replan=false,resetIds=[]}={}){
  const before=JSON.stringify(data.todos),reserved=[],pending=[],reset=new Set(resetIds);
  for(const todo of data.todos.filter(t=>!t.completed)){
   const block=(data.events||[]).filter(e=>e.type==='task-block'&&e.todoId===todo.id&&!Core.isCompleted(e,e.date,data.todos)&&!e.recordOnly).filter(e=>planEnd({date:e.date,time:e.time,minutes:e.durationMinutes||30})>now.getTime()).sort((a,b)=>startOf(a)-startOf(b))[0];
   if(block){todo.plan={date:block.date,time:block.time,minutes:Number(block.durationMinutes||30),source:'calendar',...priority(todo)};continue;}
   const old=todo.plan,ended=Number.isFinite(planEnd(old))&&planEnd(old)<=now.getTime(),startingSoon=old?.date&&Number.isFinite(planEnd(old))&&startOf(old).getTime()<=now.getTime()+30*60000;
   if(old?.date&&!reset.has(todo.id)&&(startingSoon||!replan)&&(startingSoon||old.source!=='calendar')){
    if(!ended)reserved.push(reservation(old));continue;
   }
   pending.push(todo);
  }
  pending.sort((a,b)=>priority(a).rank-priority(b).rank||(Number(a.createdAt)||0)-(Number(b.createdAt)||0)||String(a.id).localeCompare(String(b.id)));
  for(const todo of pending){
   const inferred=estimate(todo.text),minutes=Number.isInteger(todo.planMinutes)&&todo.planMinutes>=5&&todo.planMinutes<=240?todo.planMinutes:inferred.minutes;
   const slot=suggestions(data,todo,{now,minutes,reservations:reserved,limit:1})[0];
   todo.plan={date:slot?.date||null,time:slot?.time||null,minutes,source:'recommended',...priority(todo),estimateReason:todo.planMinutes?'Duration you selected.':inferred.reason};
   if(slot)reserved.push(reservation(slot));
  }
  return before!==JSON.stringify(data.todos);
 }
 function conflict(data,slot,todoId){
  const start=Core.parse(slot.date);const m=clock(slot.time);if(!Number.isFinite(m)||m>1439)return true;start.setHours(Math.floor(m/60),m%60,0,0);const end=new Date(start.getTime()+Number(slot.minutes)*60000);
  const day=Core.parse(slot.date),last=new Date(day);last.setHours(23,59,59,999);
  return (data.events||[]).filter(e=>!e.recordOnly&&!['subscription-cancelled','subscription-renewed'].includes(e.type)&&e.todoId!==todoId&&!(e.type==='task-block'&&!(data.todos||[]).some(t=>t.id===e.todoId&&!t.completed))).some(e=>Core.occurrences(e,day,last,{todos:data.todos}).some(b=>start.getTime()<b.getTime()+Number(e.durationMinutes||30)*60000&&end>b));
 }
 return {WINDOWS,validWindows,estimate,priority,planEnd,planTasks,suggestions,conflict};
});
