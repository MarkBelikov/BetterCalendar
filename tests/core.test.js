const test=require('node:test'),assert=require('node:assert/strict');
const Core=require('../core'),AI=require('../ai-memory');
const fresh=()=>structuredClone(AI.DEFAULT_MEMORY);
const data=()=>({events:[],todos:[],journals:{},completions:[]});
test('month-end subscriptions clamp then return to anchor day',()=>{
 const e={date:'2026-01-31',time:'09:00',recurrence:'monthly'};
 assert.equal(Core.occurs(e,'2026-02-28'),true);assert.equal(Core.occurs(e,'2026-03-31'),true);assert.equal(Core.occurs(e,'2026-03-28'),false);
 assert.deepEqual(Core.occurrences(e,new Date(2026,1,1),new Date(2026,3,1)).map(Core.key),['2026-02-28','2026-03-31']);
});
test('leap-day anniversaries and original start boundary',()=>{
 const e={date:'2024-02-29',recurrence:'yearly'};assert.equal(Core.occurs(e,'2025-02-28'),true);assert.equal(Core.occurs(e,'2028-02-29'),true);assert.equal(Core.occurs(e,'2023-02-28'),false);
});
test('imports only the active branch and dedup hashes remain stable',()=>{
 const raw=JSON.stringify([{id:'a',title:'Cologne recommendations',current_node:'chosen',mapping:{root:{parent:null,children:['old','chosen'],message:{author:{role:'user'},content:{parts:['I like woody scents.']}}},old:{parent:'root',message:{author:{role:'assistant'},content:{parts:['Wrong branch']}}},chosen:{parent:'root',message:{author:{role:'assistant'},content:{parts:['Try a woody fragrance.']}}}}}]);
 const [s]=AI.parseImport(raw,'conversations.json');assert.match(s.text,/woody/);assert.doesNotMatch(s.text,/Wrong branch/);assert.equal(s.aiEnabled,false);assert.equal(s.fingerprint,AI.parseImport(raw,'conversations.json')[0].fingerprint);
});
test('matching enabled chats retrieve cologne context across app conversations',()=>{
 const m=fresh();m.sources.push({id:'cologne',title:'Cologne recommendations',text:'user: I prefer fresh woody fragrances. assistant: Test a sample first.',aiEnabled:true},{id:'private',title:'Cologne private',text:'SECRET',aiEnabled:false});
 m.threads.push({id:'other',title:'Fragrance budget',messages:[{role:'user',text:'For cologne, keep it under $100.'}],aiEnabled:true});
 const c=AI.context(m,data(),{question:'What cologne did we discuss?',shareChats:true});assert.match(c.body,/fresh woody/);assert.match(c.body,/under \$100/);assert.doesNotMatch(c.body,/SECRET/);assert.equal(c.sources.length,2);
});
test('privacy controls exclude profile, journals and archive; manual attachment works',()=>{
 const m=fresh();m.sources.push({id:'x',title:'Unrelated title',text:'PAST CHAT',aiEnabled:true});const d=data();d.journals['2026-10-01']='PRIVATE JOURNAL';
 const c=AI.context(m,d,{question:'hello',sourceIds:['x'],shareChats:false,shareProfile:false,shareJournals:false,shareCalendar:false});assert.equal(c.body,'');
 assert.match(AI.context(m,d,{question:'hello',sourceIds:['x'],shareChats:true}).body,/PAST CHAT/);
});
test('monthly cap blocks before any API call',async()=>{
 const m=fresh();m.requestLimit=1;m.usage['2026-10']={requests:1};let calls=0;
 await assert.rejects(AI.ask({memory:m,data:data(),request:{question:'Hello'},apiKey:'test',writeMemory:()=>{},fetchFn:async()=>{calls++;},now:new Date(2026,9,5)}),/limit/);assert.equal(calls,0);
});
test('missing key produces no network activity or usage charge',async()=>{
 const m=fresh();let calls=0;await assert.rejects(AI.ask({memory:m,data:data(),request:{question:'Hello'},apiKey:'',writeMemory:()=>{},fetchFn:()=>{calls++;}}),/API key/);assert.equal(calls,0);assert.deepEqual(m.usage,{});
});
test('explicit question makes exactly one stateless request and persists chat and usage',async()=>{
 const m=fresh();let calls=0,writes=0;
 const answer=await AI.ask({memory:m,data:data(),request:{question:'Plan tomorrow',shareCalendar:true},apiKey:'test',writeMemory:()=>{writes++;},now:new Date(2026,9,5),fetchFn:async(url,opts)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');const p=JSON.parse(opts.body);assert.equal(p.store,false);assert.equal(p.max_output_tokens,1400);assert.equal(p.model,'gpt-6-luna');return {ok:true,json:async()=>({output:[{type:'message',content:[{type:'output_text',text:'Pick one priority.'}]}],usage:{input_tokens:100,output_tokens:25}})};}});
 assert.equal(calls,1);assert.equal(writes,2);assert.equal(answer.answer,'Pick one priority.');assert.equal(m.threads[0].messages.length,2);assert.equal(m.usage['2026-10'].requests,1);assert.equal(m.usage['2026-10'].outputTokens,25);
});
test('API failures count toward cap and do not silently retry',async()=>{
 const m=fresh();let calls=0;await assert.rejects(AI.ask({memory:m,data:data(),request:{question:'Hello'},apiKey:'test',writeMemory:()=>{},now:new Date(2026,9,5),fetchFn:async()=>{calls++;return {ok:false,status:429};}}),/quota/);assert.equal(calls,1);assert.equal(m.usage['2026-10'].requests,1);assert.equal(m.threads.length,0);
});
test('progress keeps completions when completed tasks were cleared',()=>{
 const d=data();d.completions=[{date:'2026-10-05',text:'Done'}];d.journals['2026-10-05']='Reflected';d.todos=[{text:'Late',dueDate:'2026-10-04',completed:false}];const p=Core.progress(d,new Date(2026,9,5));assert.equal(p.completed,1);assert.equal(p.journalDays,1);assert.equal(p.open,1);assert.equal(p.overdue,undefined);
});

test('legacy task dates never become deadlines in progress or AI context',()=>{
 const d=data();d.todos=[{id:'old',text:'Choose a fragrance',dueDate:'2020-01-01',createdAt:'2020-01-01T00:00:00Z',completed:false}];
 for(const now of [new Date(2026,9,5),new Date(2027,0,1)]) {
  assert.equal(Core.progress(d,now).open,1);
  const c=AI.context(fresh(),d,{question:'Help with my tasks',shareCalendar:true},now);
  assert.match(c.body,/permanent undated list/);assert.match(c.body,/Choose a fragrance/);
  assert.doesNotMatch(c.body,/dueDate|overdue|2020-01-01/);
 }
 assert.equal(d.todos[0].dueDate,'2020-01-01');
});
