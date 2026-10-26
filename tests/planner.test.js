const test=require('node:test'),assert=require('node:assert/strict'),Planner=require('../planner-core'),Core=require('../core');
const data=()=>({settings:{},events:[],todos:[{id:'paint',text:'Paint Warhammer models',completed:false}]});
test('painting gets a concrete one-hour slot while the original task remains undated',()=>{
 const d=data(),now=new Date(2026,9,12,10),slots=Planner.suggestions(d,d.todos[0],{now});
 assert.equal(Planner.estimate(d.todos[0].text).minutes,60);assert.deepEqual(slots[0],{date:'2026-10-12',time:'18:00',minutes:60});assert.equal(slots.length,3);assert.equal(d.todos[0].dueDate,undefined);
});
test('suggestions avoid saved appointments and use configurable availability',()=>{
 const d=data();d.settings.availability={weekdayStart:'17:00',weekdayEnd:'20:00',weekendStart:'10:00',weekendEnd:'12:00'};
 d.events=[{id:'busy',date:'2026-10-12',time:'17:00',durationMinutes:90,type:'event'}];
 assert.equal(Planner.suggestions(d,d.todos[0],{now:new Date(2026,9,12,10)})[0].time,'18:30');
 assert.equal(Planner.conflict(d,{date:'2026-10-12',time:'17:15',minutes:60},'paint'),true);assert.equal(Planner.conflict(d,{date:'2026-10-12',time:'18:30',minutes:60},'paint'),false);
});
test('late-evening suggestions go to another day, and invalid windows fall back safely',()=>{
 const d=data();d.settings.availability={weekdayStart:'20:70',weekdayEnd:'18:00'};
 assert.equal(Planner.validWindows(d.settings.availability),false);
 assert.equal(Planner.suggestions(d,d.todos[0],{now:new Date(2026,9,12,20,40)})[0].date,'2026-10-13');
});
test('own reserved block can be rescheduled; records and inactive task blocks do not consume availability',()=>{
 const d=data();d.events=[{date:'2026-10-12',time:'18:00',durationMinutes:60,type:'task-block',todoId:'paint'},{date:'2026-10-12',time:'18:00',durationMinutes:60,type:'subscription-cancelled',recordOnly:true},{date:'2026-10-12',time:'18:00',durationMinutes:60,type:'task-block',todoId:'deleted'}];
 assert.equal(Planner.suggestions(d,d.todos[0],{now:new Date(2026,9,12,10)})[0].time,'18:00');
});
test('cancelling a subscription preserves earlier dates but stops future occurrences and payment forecasts',()=>{
 const e={id:'payment',date:'2026-09-01',time:'09:00',type:'subscription',amount:12,recurrence:'monthly',endedOn:'2026-10-12'};
 assert.equal(Core.occurs(e,'2026-10-01'),true);assert.equal(Core.occurs(e,'2026-11-01'),false);
 assert.equal(Core.progress({events:[e]},new Date(2026,9,12)).paymentTotal,0);
});

test('automatic deadlines prioritize job apps over minis added earlier and reserve separate slots',()=>{
 const d={settings:{},events:[],todos:[{id:'hobby',text:'Paint minis',createdAt:1},{id:'career',text:'Send job apps',createdAt:2}]};
 const now=new Date(2026,9,12,10);Planner.planTasks(d,{now,replan:true});
 assert.equal(d.todos[1].plan.time,'18:00');assert.equal(d.todos[1].plan.minutes,30);
 assert.equal(d.todos[0].plan.time,'18:30');assert.equal(d.todos[0].plan.minutes,60);
 assert.equal(Planner.planEnd(d.todos[1].plan),new Date(2026,9,12,18,30).getTime());
 assert.equal(d.events.length,0);assert.equal(d.todos[0].dueDate,undefined);
});
test('new career work reprioritizes future hobby targets; estimates support counts and written durations',()=>{
 const d=data(),now=new Date(2026,9,12,10);Planner.planTasks(d,{now});
 d.todos.push({id:'job',text:'Send 3 job apps',createdAt:2});Planner.planTasks(d,{now,replan:true});
 assert.equal(d.todos[1].plan.minutes,90);assert.equal(d.todos[1].plan.time,'18:00');assert.equal(d.todos[0].plan.time,'19:30');
 assert.equal(Planner.estimate('Study for 2 hours').minutes,120);assert.equal(Planner.estimate('Paint minis').minutes,60);
});
test('whole-list plans avoid calendar conflicts and spill into the next available day',()=>{
 const d={settings:{availability:{weekdayStart:'18:00',weekdayEnd:'19:00',weekendStart:'13:00',weekendEnd:'14:00'}},events:[{date:'2026-10-12',time:'18:00',durationMinutes:30,type:'event'}],todos:[{id:'a',text:'Send job apps'},{id:'b',text:'Paint minis'}]};
 Planner.planTasks(d,{now:new Date(2026,9,12,10)});
 assert.equal(d.todos[0].plan.time,'18:30');assert.equal(d.todos[0].plan.date,'2026-10-12');assert.equal(d.todos[1].plan.date,'2026-10-13');
 assert.equal(Planner.suggestions(d,d.todos[1],{now:new Date(2026,9,12,10)})[0].date,'2026-10-13');
});
test('reopening and automatic replanning retain missed targets until explicit replanning',()=>{
 const d=data();Planner.planTasks(d,{now:new Date(2026,9,12,10)});const missed=structuredClone(d.todos[0].plan);
 const now=new Date(2026,9,13,10);assert.equal(Planner.planTasks(d,{now}),false);
 d.todos.push({id:'new',text:'Send job apps'});Planner.planTasks(d,{now,replan:true});
 assert.deepEqual(d.todos[0].plan,missed);
 Planner.planTasks(d,{now,replan:true,resetIds:['paint']});assert.equal(d.todos[0].plan.date,'2026-10-13');
 assert.equal(d.todos[0].plan.time,'18:30');
});
test('existing calendar blocks stay fixed and consume capacity for new recommendations',()=>{
 const d=data();d.events=[{type:'task-block',todoId:'paint',date:'2026-10-12',time:'18:00',durationMinutes:60}];d.todos.push({id:'job',text:'Send job apps'});
 Planner.planTasks(d,{now:new Date(2026,9,12,10),replan:true});
 assert.equal(d.todos[0].plan.source,'calendar');assert.equal(d.todos[0].plan.time,'18:00');assert.equal(d.todos[1].plan.time,'19:00');
 assert.equal(d.events[0].time,'18:00');
});
test('priority and duration corrections are respected; completing work frees future capacity',()=>{
 const d={settings:{},events:[],todos:[{id:'hobby',text:'Paint minis',planPriority:0,planMinutes:45},{id:'job',text:'Send job apps'}]},now=new Date(2026,9,12,10);
 Planner.planTasks(d,{now});assert.equal(d.todos[0].plan.time,'18:00');assert.equal(d.todos[1].plan.time,'18:45');
 d.todos[0].completed=true;Planner.planTasks(d,{now,replan:true});assert.equal(d.todos[1].plan.time,'18:00');
});
test('planner reports no capacity instead of inventing a deadline or overlapping appointments',()=>{
 const d=data();d.settings.availability={weekdayStart:'18:00',weekdayEnd:'18:15',weekendStart:'13:00',weekendEnd:'13:15'};
 Planner.planTasks(d,{now:new Date(2026,9,12,10)});assert.equal(d.todos[0].plan.date,null);
 assert.equal(Number.isNaN(Planner.planEnd(d.todos[0].plan)),true);
});
test('a new calendar event moves upcoming recommendations without moving expired deadlines',()=>{
 const d=data(),now=new Date(2026,9,12,10);Planner.planTasks(d,{now});d.events.push({type:'event',date:'2026-10-12',time:'18:00',durationMinutes:60});
 Planner.planTasks(d,{now,replan:true});assert.equal(d.todos[0].plan.time,'19:00');
});
test('work starting now is not postponed when another task is added',()=>{
 const d=data();Planner.planTasks(d,{now:new Date(2026,9,12,10)});const original=structuredClone(d.todos[0].plan);
 d.todos.push({id:'job',text:'Send job apps'});Planner.planTasks(d,{now:new Date(2026,9,12,18,10),replan:true});
 assert.deepEqual(d.todos[0].plan,original);assert.equal(d.todos[1].plan.time,'19:00');
});
test('completed reminders stop reserving slots, but the next recurrence still reserves its own slot',()=>{
 const d=data(),e={id:'r',date:'2026-10-26',time:'18:00',durationMinutes:60,recurrence:'monthly',type:'reminder'};d.events=[e];
 Core.setCompleted(e,e.date,true);assert.equal(Planner.suggestions(d,d.todos[0],{now:new Date(2026,9,26,10)})[0].time,'18:00');
 assert.equal(Planner.suggestions(d,d.todos[0],{now:new Date(2026,10,26,10)})[0].time,'19:00');
});
