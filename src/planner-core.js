(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./core'));else root.PlannerCore=factory(root.CalendarCore);})(typeof globalThis!=='undefined'?globalThis:this,function(Core){
 'use strict';
 const WINDOWS={weekdayStart:'18:00',weekdayEnd:'21:00',weekendStart:'13:00',weekendEnd:'18:00'};
 const clock=s=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s)?Number(s.slice(0,2))*60+Number(s.slice(3)):NaN;
 const validWindows=w=>['weekday','weekend'].every(k=>{const a=clock(w[k+'Start']),b=clock(w[k+'End']);return Number.isFinite(a)&&Number.isFinite(b)&&a>=0&&b<=1439&&a<b;});
 function estimate(text){
  if(/warhammer|paint|miniature|model|hobby/i.test(text))return {minutes:60,reason:'A one-hour creative session gives you time to set up and make visible progress.'};
  if(/application|apply|resume|recruiter|email|follow.up/i.test(text))return {minutes:30,reason:'A focused half-hour is a manageable start for an application or follow-up.'};
  if(/study|learn|portfolio|project|code|workout|gym|walk/i.test(text))return {minutes:45,reason:'A 45-minute block leaves room to get into the activity without filling the whole evening.'};
  return {minutes:25,reason:'A 25-minute starting block makes the first step easier. Adjust it if you need longer.'};
 }
 function suggestions(data,todo,{now=new Date(),minutes=estimate(todo.text).minutes}={}){
  const duration=Number(minutes);if(!Number.isInteger(duration)||duration<5||duration>240)return [];
  const raw=data.settings?.availability||WINDOWS,w=validWindows(raw)?raw:WINDOWS,slots=[];
  for(let offset=0;offset<14&&slots.length<3;offset++){
   const day=new Date(now.getFullYear(),now.getMonth(),now.getDate()+offset),endDay=new Date(day);endDay.setHours(23,59,59,999);
   const kind=[0,6].includes(day.getDay())?'weekend':'weekday',startMinute=clock(w[kind+'Start']),endMinute=clock(w[kind+'End']);
   const busy=(data.events||[]).filter(e=>!e.recordOnly&&!['subscription-cancelled','subscription-renewed'].includes(e.type)&&e.todoId!==todo.id&&!(e.type==='task-block'&&!(data.todos||[]).some(t=>t.id===e.todoId&&!t.completed))).flatMap(e=>Core.occurrences(e,day,endDay).map(start=>({start:start.getTime(),end:start.getTime()+Number(e.durationMinutes||30)*60000})));
   for(let m=startMinute;m+duration<=endMinute;m+=15){
    const start=new Date(day);start.setHours(Math.floor(m/60),m%60,0,0);const finish=start.getTime()+duration*60000;
    if(start.getTime()<now.getTime()+30*60000||busy.some(b=>start.getTime()<b.end&&finish>b.start))continue;
    slots.push({date:Core.key(start),time:`${String(start.getHours()).padStart(2,'0')}:${String(start.getMinutes()).padStart(2,'0')}`,minutes:duration});break;
   }
  }
  return slots;
 }
 function conflict(data,slot,todoId){
  const start=Core.parse(slot.date);const m=clock(slot.time);if(!Number.isFinite(m)||m>1439)return true;start.setHours(Math.floor(m/60),m%60,0,0);const end=new Date(start.getTime()+Number(slot.minutes)*60000);
  const day=Core.parse(slot.date),last=new Date(day);last.setHours(23,59,59,999);
  return (data.events||[]).filter(e=>!e.recordOnly&&!['subscription-cancelled','subscription-renewed'].includes(e.type)&&e.todoId!==todoId&&!(e.type==='task-block'&&!(data.todos||[]).some(t=>t.id===e.todoId&&!t.completed))).some(e=>Core.occurrences(e,day,last).some(b=>start.getTime()<b.getTime()+Number(e.durationMinutes||30)*60000&&end>b));
 }
 return {WINDOWS,validWindows,estimate,suggestions,conflict};
});
