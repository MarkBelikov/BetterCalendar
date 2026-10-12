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
