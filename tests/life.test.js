const test=require('node:test'),assert=require('node:assert/strict'),Life=require('../life-core'),AI=require('../ai-memory');
const now=new Date(2026,9,12,10).getTime(),fresh=()=>Life.normalize(),id=()=> 'r'+Math.random();
test('routine logging is reversible and does not penalize unlogged days',()=>{
 const d=fresh();Life.command(d,{type:'routine-add',title:'Movement',points:10,target:3,category:'Fitness'},now,id);
 const r=d.routines[0];Life.command(d,{type:'routine-toggle',id:r.id,date:'2026-10-12'},now);
 assert.equal(Life.weekly(d,'2026-10-12').points,10);assert.equal(Life.weekly(d,'2026-10-12').routineCounts[r.id],1);
 Life.command(d,{type:'routine-toggle',id:r.id,date:'2026-10-12'},now);assert.equal(Life.weekly(d,'2026-10-12').points,0);
 assert.throws(()=>Life.command(d,{type:'routine-toggle',id:r.id,date:'2026-10-13'},now),/up to today/);
});
test('signed action points survive archival and starter packs do not duplicate routines',()=>{
 const d=fresh();Life.command(d,{type:'routine-starters'},now,id);Life.command(d,{type:'routine-starters'},now,id);assert.equal(d.routines.length,7);
 const r=d.routines.find(r=>r.points<0);Life.command(d,{type:'routine-toggle',id:r.id,date:'2026-10-12'},now);
 Life.command(d,{type:'routine-archive',id:r.id,archived:true},now);assert.equal(Life.weekly(d,'2026-10-12').points,-25);
 Life.command(d,{type:'routine-archive',id:r.id,archived:false},now);Life.command(d,{type:'routine-toggle',id:r.id,date:'2026-10-12'},now);assert.equal(Life.weekly(d,'2026-10-12').points,0);
});
test('weeks begin Monday across year boundaries and DST',()=>{
 assert.equal(Life.weekKey('2027-01-03'),'2026-12-28');assert.equal(Life.weekKey('2026-11-01'),'2026-10-26');
 assert.deepEqual(Life.days('2026-10-26'),['2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30','2026-10-31','2026-11-01']);
});
test('career edits keep stable identity and next action; invalid dates are rejected',()=>{
 const d=fresh(),cmd={type:'career-save',company:'Example',role:'IT role',kind:'Application',status:'Applied',nextAction:'Follow up',followUpDate:'2026-10-15'};
 Life.command(d,cmd,now,()=> 'career');Life.command(d,{...cmd,id:'career',status:'Interview',notes:'Prepare systems examples'},now);
 assert.equal(d.applications.length,1);assert.equal(d.applications[0].status,'Interview');assert.equal(d.applications[0].nextAction,'Follow up');
 assert.throws(()=>Life.command(d,{...cmd,followUpDate:'2026-02-30'},now),/valid status/);
});
test('timer pause, reload, resume and repeated completion checks log one session',()=>{
 let d=fresh();Life.command(d,{type:'focus-start',minutes:1,label:'Portfolio'},now,()=> 'session');
 Life.command(d,{type:'focus-pause'},now+20000);assert.equal(d.focus.remainingMs,40000);
 d=Life.normalize(JSON.parse(JSON.stringify(d)));Life.command(d,{type:'focus-resume'},now+120000);
 assert.equal(Life.remaining(d,now+130000),30000);assert.equal(Life.settle(d,now+160001),true);assert.equal(Life.settle(d,now+170000),false);
 assert.equal(d.focusSessions.length,1);assert.equal(d.focusSessions[0].minutes,1);assert.equal(d.focusSessions[0].date,'2026-10-12');
 Life.command(d,{type:'focus-reset'},now+180000);assert.equal(d.focusSessions.length,1);
});
test('completed focus sessions belong to their deadline date after an offline restart',()=>{
 const d=fresh(),start=new Date(2026,9,12,23,59).getTime();Life.command(d,{type:'focus-start',minutes:2},start,()=> 'late');
 Life.settle(d,new Date(2026,9,15).getTime());assert.equal(d.focusSessions[0].date,'2026-10-13');
});
test('weekly reviews persist independently for each week',()=>{
 const d=fresh();Life.command(d,{type:'review-save',week:'2026-10-12',wins:'Made progress',next:'Practice interviews'},now);
 Life.command(d,{type:'review-save',week:'2026-10-05',wins:'Built a project'},now);
 assert.equal(d.weeklyReviews['2026-10-12'].next,'Practice interviews');assert.equal(d.weeklyReviews['2026-10-05'].wins,'Built a project');
 assert.throws(()=>Life.command(d,{type:'review-save',week:'2026-10-13'},now),/Monday/);
});
test('new trackers stay out of AI context until explicitly selected',()=>{
 const d={events:[],todos:[],journals:{},completions:[],life:fresh()};Life.command(d.life,{type:'career-save',company:'PRIVATE CAREER',role:'Full-time role',status:'Applied'},now,id);
 const memory=structuredClone(AI.DEFAULT_MEMORY);
 assert.doesNotMatch(AI.context(memory,d,{question:'hello',shareCalendar:true},new Date(now)).body,/PRIVATE CAREER/);
 const c=AI.context(memory,d,{question:'Help with applications',shareTrackers:true},new Date(now));assert.match(c.body,/PRIVATE CAREER/);assert.equal(c.sources[0].id,'trackers');
});
