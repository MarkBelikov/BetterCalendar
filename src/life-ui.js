(() => {
 'use strict';
 const $=s=>document.querySelector(s),LC=window.LifeCore,Core=window.CalendarCore;
 let provider,life,calendar,reviewWeek=LC.weekKey(new Date()),timer,lastDay=Core.key(new Date()),polling=false,lifeEpoch=0,careerSaving=false;
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const safe=fn=>async e=>{try{await fn(e);}catch(error){window.Companion.toast(error.message||String(error));}};
 const bind=(selector,event,fn)=>$(selector).addEventListener(event,safe(fn));
 const button=(text,fn,cls='mini-btn')=>{const b=el('button',cls,text);b.type='button';b.addEventListener('click',safe(fn));return b;};
 const empty=(target,text)=>target.append(el('div','empty-state',text));
 const short=key=>Core.parse(key).toLocaleDateString([],{month:'short',day:'numeric'});
 function metrics(target,items){target.replaceChildren();for(const [label,value] of items){const n=el('div','tracker-metric');n.append(el('strong','',value),el('small','',label));target.append(n);}}
 async function act(command){const epoch=++lifeEpoch;const result=await window.calendarAPI.updateLife(command);if(epoch===lifeEpoch){life=result;render();}}
 function renderOverview(){
  const priorities=$('#priorityList');priorities.replaceChildren();
  const pinned=calendar.todos.filter(t=>t.pinned&&!t.completed);
  if(!pinned.length)empty(priorities,'Pin a task with ☆ in your to-do list to keep it in view.');
  for(const t of pinned){const row=el('div','summary-row');row.append(el('span','',t.text),button('Done',()=>provider.updateTask(t.id,{completed:true})));priorities.append(row);}
  const agenda=$('#agendaList');agenda.replaceChildren();const now=new Date(),start=new Date(now.getFullYear(),now.getMonth(),now.getDate()),end=new Date(start);end.setDate(end.getDate()+7);end.setMilliseconds(-1);
  const entries=calendar.events.flatMap(event=>Core.occurrences(event,start,end).map(date=>({event,date}))).sort((a,b)=>a.date-b.date).slice(0,12);
  if(!entries.length)empty(agenda,'Room to breathe. Add an event or reminder when you need one.');
  for(const {event,date} of entries){const b=button(event.title,()=>provider.openDate(Core.key(date)),'agenda-button');b.append(el('small','',`${short(Core.key(date))} · ${event.time||'09:00'}${event.type==='subscription'&&event.amount?` · $${Number(event.amount).toFixed(2)}`:''}`));agenda.append(b);}
  const followups=$('#followupList');followups.replaceChildren();const today=Core.key(now),follow=life.applications.filter(a=>a.status!=='Closed'&&a.status!=='Offer'&&a.followUpDate).sort((a,b)=>a.followUpDate.localeCompare(b.followUpDate)).slice(0,6);
  if(!follow.length)empty(followups,'Give an application or conversation a next action and follow-up date.');
  for(const a of follow){const row=el('div','summary-row'),text=el('div','',a.company);text.append(el('small','',`${a.followUpDate<=today?'Ready to follow up · ':''}${short(a.followUpDate)} · ${a.nextAction||a.role}`));row.append(text,button('Open',()=>{window.Companion.showPage('career');editCareer(a);}));followups.append(row);}
  const w=LC.weekly(life),box=$('#overviewWeek');box.replaceChildren();
  for(const text of [`${w.positiveActions} helpful action${w.positiveActions===1?'':'s'} logged`,`${w.points} action points`,`${w.focusMinutes} focus minutes`,`${life.applications.filter(a=>['Applied','Interview'].includes(a.status)).length} active pipeline entries`])box.append(el('div','summary-row',text));
 }
 function renderRoutines(){
  const date=$('#routineDate').value,week=LC.weekly(life,LC.weekKey(date));
  $('#routineList').replaceChildren();$('#archivedRoutines').replaceChildren();
  const active=life.routines.filter(r=>!r.archived);if(!active.length)empty($('#routineList'),'Start with an action you care about, or add the optional suggestions.');
  for(const r of life.routines){
   if(r.archived){const row=el('div','summary-row');row.append(el('span','',r.title),button('Restore',()=>act({type:'routine-archive',id:r.id,archived:false})));$('#archivedRoutines').append(row);continue;}
   const logged=Boolean(life.routineLogs[date]?.[r.id]),row=el('div',`routine-row${logged?' done':''}`),check=el('input');check.type='checkbox';check.checked=logged;check.setAttribute('aria-label',`Log ${r.title}`);
   check.addEventListener('change',safe(async()=>{try{await act({type:'routine-toggle',id:r.id,date});}catch(error){check.checked=logged;throw error;}}));
   const text=el('div','routine-title',r.title);text.append(el('small','routine-detail',`${r.category} · ${r.points>=0?'+':''}${r.points} points · ${r.points<0?`${week.routineCounts[r.id]||0} logged · limit ${r.target}/week`:`${week.routineCounts[r.id]||0}/${r.target} this week`}`));
   row.append(check,text,button('Archive',()=>act({type:'routine-archive',id:r.id,archived:true})));$('#routineList').append(row);
  }
  const total=Object.values(life.routineLogs[date]||{}).reduce((n,l)=>n+l.points,0);$('#routineSummary').replaceChildren(el('div','summary-row',`${total} points logged on ${short(date)}`));
 }
 function clearCareer(){ $('#careerForm').reset();$('#careerId').value='';$('#careerFormTitle').textContent='Add an opportunity'; }
 function editCareer(a){for(const [field,key] of [['Id','id'],['Company','company'],['Role','role'],['Kind','kind'],['Status','status'],['Source','source'],['Next','nextAction'],['Followup','followUpDate'],['Notes','notes']])$('#career'+field).value=a[key]||'';$('#careerFormTitle').textContent='Edit opportunity';$('#careerCompany').focus();}
 function renderCareer(){
  const target=$('#careerList'),filter=$('#careerFilter').value;target.replaceChildren();
  metrics($('#careerStats'),[['Saved',life.applications.filter(a=>a.status==='Saved').length],['Applied',life.applications.filter(a=>a.status==='Applied').length],['Interviews',life.applications.filter(a=>a.status==='Interview').length],['Outreach',life.applications.filter(a=>a.kind==='Outreach'&&a.status!=='Closed').length]]);
  const matches=life.applications.filter(a=>filter==='all'||filter==='active'?filter==='all'||a.status!=='Closed':a.status===filter).slice().reverse();
  if(!matches.length)empty(target,'Your next opportunity starts here. Add a role or an outreach conversation.');
  for(const a of matches){const card=el('article','career-card'),heading=el('div','section-heading');heading.append(el('h3','',a.company),el('span','status-tag',a.status));card.append(heading,el('small','',`${a.kind} · ${a.role}${a.source?' · '+a.source:''}`));
   if(a.nextAction)card.append(el('p','',a.nextAction));if(a.followUpDate)card.append(el('small','',`Follow up: ${short(a.followUpDate)}`));
   if(a.notes){const detail=el('details');detail.append(el('summary','footnote','Notes'),el('p','',a.notes));card.append(detail);}
   const actions=el('div','career-actions');actions.append(button('Edit',()=>editCareer(a)));
   if(a.followUpDate)actions.append(button('Calendar reminder',async()=>{await provider.scheduleFollowUp(a);window.Companion.toast('Follow-up reminder saved on the calendar for 9:00 AM.');}));
   card.append(actions);target.append(card);
  }
 }
 function renderReview(fill=false){
  $('#reviewWeekLabel').textContent=`${short(reviewWeek)} – ${short(LC.days(reviewWeek)[6])}, ${reviewWeek.slice(0,4)}`;
  const w=LC.weekly(life,reviewWeek);metrics($('#reviewMetrics'),[['Helpful actions',w.positiveActions],['Logged points',w.points],['Focus minutes',w.focusMinutes]]);
  const value=life.weeklyReviews[reviewWeek]||{};
  for(const [field,key] of [['Wins','wins'],['Improve','improve'],['Next','next']])if(fill)$('#review'+field).value=value[key]||'';
 }
 function renderFocus(){
  const f=life.focus;$('#focusLabel').disabled=f.running;$('#focusMinutes').disabled=f.running;
  $('#focusStartBtn').disabled=f.running;$('#focusPauseBtn').disabled=!f.running;$('#focusResumeBtn').disabled=f.running||!f.id||f.remainingMs<=0;
  $('#focusStatus').textContent=f.running?`In progress · ${f.label}`:f.id?(f.remainingMs>0?`Paused · ${f.label}`:'Session complete. Take a break when you need one.'):'No automatic sessions. Press Start when you are ready.';
  const history=$('#focusHistory');history.replaceChildren();
  if(!life.focusSessions.length)empty(history,'Finished sessions will appear here.');
  life.focusSessions.slice(-20).reverse().forEach(s=>{const row=el('div','summary-row'),text=el('div','',s.label);text.append(el('small','',`${short(s.date)} · ${s.minutes} minutes`));row.append(text);history.append(row);});tick();
 }
 function tick(){if(!life)return;const ms=!life.focus.id?Math.max(1,Math.min(180,Number($('#focusMinutes').value)||25))*60000:LC.remaining(life),seconds=Math.ceil(ms/1000);$('#focusCountdown').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  const today=Core.key(new Date());if(today!==lastDay){const wasToday=$('#routineDate').value===lastDay;lastDay=today;$('#routineDate').max=today;if(wasToday)$('#routineDate').value=today;renderRoutines();renderOverview();}
 }
 async function refreshFocus(){if(polling||!life?.focus.running)return;polling=true;const epoch=lifeEpoch;try{const fresh=await window.calendarAPI.getLife();if(epoch===lifeEpoch&&(!fresh.focus.running||fresh.focus.id!==life.focus.id)){life=fresh;render();}}catch(e){window.Companion.toast(e.message);}finally{polling=false;}}
 function render(){if(!life||!calendar)return;renderOverview();renderRoutines();renderCareer();renderReview();renderFocus();}
 async function init(p){
  provider=p;calendar=p.getState();life=await window.calendarAPI.getLife();
  $('#routineDate').value=lastDay;$('#routineDate').max=lastDay;
  bind('#routineDate','change',()=>{if(!LC.dateOK($('#routineDate').value))$('#routineDate').value=lastDay;renderRoutines();});
  bind('#routineForm','submit',async e=>{e.preventDefault();await act({type:'routine-add',title:$('#routineTitle').value,category:$('#routineCategory').value,target:$('#routineTarget').value,points:$('#routinePoints').value});$('#routineTitle').value='';});
  bind('#starterRoutinesBtn','click',()=>act({type:'routine-starters'}));
  bind('#careerForm','submit',async e=>{e.preventDefault();if(careerSaving)return;careerSaving=true;const submit=$('#careerForm button[type=submit]');submit.disabled=true;try{await act({type:'career-save',id:$('#careerId').value,company:$('#careerCompany').value,role:$('#careerRole').value,kind:$('#careerKind').value,status:$('#careerStatus').value,source:$('#careerSource').value,nextAction:$('#careerNext').value,followUpDate:$('#careerFollowup').value,notes:$('#careerNotes').value});clearCareer();window.Companion.toast('Opportunity saved.');}finally{careerSaving=false;submit.disabled=false;}});
  bind('#careerCancelBtn','click',clearCareer);bind('#careerFilter','change',renderCareer);
  bind('#reviewPrevBtn','click',()=>{const d=Core.parse(reviewWeek);d.setDate(d.getDate()-7);reviewWeek=Core.key(d);$('#reviewSaveStatus').textContent='';renderReview(true);});
  bind('#reviewNextBtn','click',()=>{const d=Core.parse(reviewWeek);d.setDate(d.getDate()+7);reviewWeek=Core.key(d);$('#reviewSaveStatus').textContent='';renderReview(true);});
  bind('#reviewForm','submit',async e=>{e.preventDefault();await act({type:'review-save',week:reviewWeek,wins:$('#reviewWins').value,improve:$('#reviewImprove').value,next:$('#reviewNext').value});$('#reviewSaveStatus').textContent='Saved locally.';});
  bind('#focusMinutes','input',tick);
  bind('#focusForm','submit',async e=>{e.preventDefault();await act({type:'focus-start',label:$('#focusLabel').value,minutes:$('#focusMinutes').value});});
  bind('#focusPauseBtn','click',()=>act({type:'focus-pause'}));bind('#focusResumeBtn','click',()=>act({type:'focus-resume'}));bind('#focusResetBtn','click',()=>act({type:'focus-reset'}));
  render();renderReview(true);let count=0;timer=setInterval(()=>{tick();if(++count%3===0||life.focus.running&&LC.remaining(life)===0)refreshFocus();},1000);
  window.addEventListener('focus',()=>{tick();refreshFocus();});window.addEventListener('beforeunload',()=>clearInterval(timer));
 }
 window.LifeUI={init,updateCalendar:data=>{calendar=data;if(life)renderOverview();}};
})();
