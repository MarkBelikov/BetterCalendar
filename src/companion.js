(() => {
  'use strict';
  const $ = s=>document.querySelector(s), api=window.calendarAPI;
  let memory,calendar,threadId=null,attached=[],sourceViewing=null,busy=false,toastTimer;
  const titles={
    overview:["KEEP YOUR NEXT STEP CLEAR","A little direction. More momentum.","Your priorities, agenda and follow-ups in one place."],
    routines:["YOUR HABITS, YOUR RULES","Build a rhythm that fits your life.","Flexible actions and weekly targets. Every check-in stays local."],
    career:["YOUR NEXT CHAPTER","Keep your opportunities moving.","Tailored applications, useful conversations and clear next actions."],
    focus:["MAKE ROOM FOR DEEP WORK","One thing at a time.","A local timer for work, learning, projects and hobbies."],
    calendar:['YOUR DAY, ON PURPOSE','Make room for what matters.','Plan your time. Clear your mind. Keep moving.'],
    progress:['SMALL STEPS ADD UP','Look at how far you’ve come.','A clear view of your tasks, reflections, and upcoming payments.'],
    companion:['THINK IT THROUGH','Your always-available companion.','A little perspective, whenever you need it.'],
    memory:['PICK UP WHERE YOU LEFT OFF','Less repeating. More continuity.','Your preferences and past conversations, in one place.'],
    settings:['MAKE IT YOURS','Set your own rhythm.','Reminders, your AI connection, and your local data.']
  };
  function toast(message) {
    $('#toast').textContent=message; $('#toast').classList.remove('hidden');
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.add('hidden'),6500);
  }
  const safe = fn => async event => { try {await fn(event);} catch(e) {toast(e.message||String(e));} };
  function bind(id,event,fn) { $(id).addEventListener(event,safe(fn)); }
  function node(tag,className,content) {const n=document.createElement(tag);if(className)n.className=className;if(content!==undefined)n.textContent=content;return n;}
  function button(label,fn,cls='mini-btn') {const b=node('button',cls,label);b.type='button';b.addEventListener('click',safe(fn));return b;}
  function page(name) {
    document.querySelectorAll('.page').forEach(el=>el.classList.toggle('hidden',el.id!==`page-${name}`));
    document.querySelectorAll('[data-page]').forEach(el=>{el.classList.toggle('active',el.dataset.page===name);el.setAttribute('aria-current',el.dataset.page===name?'page':'false');});
    const t=titles[name]; $('#pageEyebrow').textContent=t[0];$('#pageTitle').textContent=t[1];$('#pageSubtitle').textContent=t[2];
    $('.top-actions').classList.toggle('hidden',name!=='calendar');
    if(name==='progress')renderProgress(calendar.getState());
    if(name==='companion')renderChat();
  }
  function renderProgress(data) {
    const p=CalendarCore.progress(data),stats=$('#progressStats'); if(!stats)return;
    stats.replaceChildren();
    for(const [label,value,detail] of [['TASKS DONE',p.completed,'In the last 7 days'],['JOURNAL DAYS',`${p.journalDays}/7`,'In the last 7 days'],['OPEN TASKS',p.open,'On your permanent list'],['UPCOMING PAYMENTS',`$${p.paymentTotal.toFixed(2)}`,'In the next 30 days']]) {
      const card=node('div','panel stat');card.append(node('div','eyebrow',label),node('div','stat-number',value),node('small','',detail));stats.append(card);
    }
    const list=$('#paymentList');list.replaceChildren();
    if(!p.payments.length)list.append(node('div','empty-state','No payments scheduled in the next 30 days.'));
    p.payments.slice(0,12).forEach(e=>{const row=node('div','summary-row'),left=node('div','',e.title);left.append(node('small','',`${e.occurrence} · ${e.time || '09:00'}`));row.append(left,node('strong','',e.amount!==''&&e.amount!=null?`$${Number(e.amount).toFixed(2)}`:'—'));list.append(row);});
    const tips=$('#localTips');tips.replaceChildren();
    for (const tip of [p.open ? `${p.open} open task${p.open===1?'':'s'}. Choose one whenever you’re ready.` : 'Your list is clear. Add something whenever you need to.',p.journalDays<7 ? 'Take two minutes to reflect on today before bed.' : 'You’ve reflected every day this week. Keep that rhythm.',p.payments.length ? `Your next payment is ${p.payments[0].title} on ${p.payments[0].occurrence}.` : 'Add recurring subscriptions to avoid last-minute surprises.']) tips.append(node('div','summary-row',tip));
  }
  async function refresh() {memory=await api.getMemory();renderMemory();renderChat();renderSettings();}
  function renderUpdates(status) {
    $('#updateStatus').textContent=status.message+(status.phase==='downloading'?` ${status.percent}%`:'');
    $('#restartUpdateBtn').classList.toggle('hidden',status.phase!=='ready');
    $('#checkUpdatesBtn').disabled=['checking','downloading','ready','installing','unsupported'].includes(status.phase);
  }
  function renderSettings() {
    $('#requestLimit').value=memory.requestLimit;
    $('#keyStatus').textContent=memory.keyConfigured?'Key saved with your computer’s encrypted credential storage.':'No key connected. Local features are ready to use.';
    const usage=memory.usage[CalendarCore.key(new Date()).slice(0,7)]||{};
    $('#usageLabel').textContent=`This month: ${usage.requests||0} / ${memory.requestLimit} requests · ${usage.inputTokens||0} input tokens · ${usage.outputTokens||0} output tokens.`;
    $('#aiStatus').textContent=busy?'Thinking…':memory.keyConfigured?'Ready when you are':'Set up in Settings';
  }
  function renderChat() {
    const list=$('#threadList');list.replaceChildren();
    memory.threads.slice().reverse().forEach(t=>list.append(button(t.title,()=>{if(busy)return;threadId=t.id;attached=[];renderChat();},`mini-btn thread-btn${t.id===threadId?' selected':''}`)));
    if(!memory.threads.length)list.append(node('div','empty-state','Your conversations will appear here.'));
    const current=memory.threads.find(t=>t.id===threadId),container=$('#chatMessages');container.replaceChildren();
    $('#chatTitle').textContent=current?.title||'A place to think things through.';
    if(!current) {
      const empty=node('div','chat-empty');empty.append(node('span','chat-symbol','✧'),node('h2','','What’s on your mind?'),node('p','','Plan the week, reflect on your progress, or revisit a conversation you’ve saved. Your companion only wakes up when you press Send.'));container.append(empty);
    } else current.messages.forEach(m=>{
      const bubble=node('div',`message ${m.role}`);bubble.append(node('div','message-label',m.role==='user'?'YOU':'COMPANION'),node('div','message-text',m.text));
      if(m.sources?.length)bubble.append(node('div','message-sources','Context: '+m.sources.map(s=>s.title).join(' · ')));
      container.append(bubble);
    });
    if(attached.length)container.append(node('div','footnote',`Attached to next question: ${allSources().filter(s=>attached.includes(s.id)).map(s=>s.title).join(', ')}`));
    container.scrollTop=container.scrollHeight;
  }
  function allSources() {
    return [...memory.sources,...memory.threads.map(t=>({...t,origin:'App conversation',text:t.messages.map(m=>m.role+': '+m.text).join('\n\n')}))];
  }
  function renderMemory() {
    if(document.activeElement!==$('#profileText'))$('#profileText').value=memory.profile;
    const term=$('#memorySearch').value.toLowerCase(),all=allSources();
    $('#memoryCount').textContent=`${all.length} saved`;
    const list=$('#sourceList');list.replaceChildren();
    const matches=all.filter(s=>(s.title+' '+s.text).toLowerCase().includes(term));
    if(!matches.length)list.append(node('div','empty-state',all.length?'No matches. Try a different word.':'Import or paste a conversation to start your archive.'));
    for(const s of matches.slice(0,80)) {
      const row=node('article','source-row');row.append(node('h3','',s.title),node('div','muted',`${s.origin} · ${s.text.length.toLocaleString()} characters`));
      const tools=node('div','source-tools'),label=node('label','check-label'),check=node('input');check.type='checkbox';check.checked=s.aiEnabled===true;check.disabled=busy;
      check.addEventListener('change',safe(async()=>{memory=await api.updateMemory({type:'source-toggle',id:s.id,enabled:check.checked});renderMemory();}));
      label.append(check,document.createTextNode('AI access'));tools.append(label,button('Open',()=>showSource(s)),button('Delete',async()=>{
        if(!confirm(`Delete “${s.title}” from this app?`))return;
        memory=await api.updateMemory({type:'delete-source',id:s.id});if(threadId===s.id)threadId=null;attached=attached.filter(i=>i!==s.id);renderMemory();renderChat();
      }));row.append(tools);list.append(row);
    }
    if(matches.length>80)list.append(node('div','footnote','Showing 80 matches. Search to narrow the list.'));
  }
  function showSource(source) {sourceViewing=source;$('#sourceTitle').textContent=source.title;$('#sourceBody').textContent=source.text;$('#attachSourceBtn').disabled=busy;$('#sourceDialog').showModal();}
  function request() {return {question:$('#aiQuestion').value,threadId,sourceIds:attached,shareProfile:$('#shareProfile').checked,shareChats:$('#shareChats').checked,shareCalendar:$('#shareCalendar').checked,shareTrackers:$('#shareTrackers').checked,shareJournals:$('#shareJournals').checked};}
  function setBusy(value) {busy=value;for(const id of ['#sendAIBtn','#newChatBtn','#aiQuestion','#shareProfile','#shareChats','#shareCalendar','#shareTrackers','#shareJournals'])$(id).disabled=value;$('#sendAIBtn').textContent=value?'Thinking…':'Send ↗';renderSettings();}
  async function init(provider) {
    calendar=provider;
    document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>page(b.dataset.page)));
    document.querySelectorAll('[data-prompt]').forEach(b=>b.addEventListener('click',()=>{if(busy)return;page('companion');$('#aiQuestion').value=b.dataset.prompt;$('#aiQuestion').focus();}));
    bind('#reviewWeekBtn','click',()=>{page('companion');$('#aiQuestion').value='Review my progress this week and suggest one thing to improve.';});
    bind('#newChatBtn','click',()=>{if(busy)return;threadId=null;attached=[];renderChat();});
    bind('#memorySearch','input',renderMemory);
    bind('#saveProfileBtn','click',async()=>{memory=await api.updateMemory({type:'profile',text:$('#profileText').value});toast('Profile saved.');});
    bind('#savePasteBtn','click',async()=>{memory=await api.updateMemory({type:'paste',title:$('#pasteTitle').value,text:$('#pasteText').value});$('#pasteTitle').value='';$('#pasteText').value='';renderMemory();toast('Chat saved. Enable AI access when you want the companion to use it.');});
    bind('#sourceDialog','close',()=>{sourceViewing=null;});
    bind('#closeSourceBtn','click',()=>$('#sourceDialog').close());
    bind('#attachSourceBtn','click',async()=>{
      if(!sourceViewing)return;
      memory=await api.updateMemory({type:'source-toggle',id:sourceViewing.id,enabled:true});
      attached=[...new Set([...attached,sourceViewing.id])].slice(-4);$('#shareChats').checked=true;$('#sourceDialog').close();renderMemory();page('companion');renderChat();$('#aiQuestion').focus();
    });
    bind('#importChatsBtn','click',async()=>{
      const list=await api.chooseImport();if(!list.length)return;
      $('#importList').replaceChildren();$('#selectAllImports').checked=false;
      list.forEach(s=>{const label=node('label'),input=node('input');input.type='checkbox';input.dataset.id=s.id;label.append(input,document.createTextNode(`${s.title} · ${s.length.toLocaleString()} characters`));$('#importList').append(label);});$('#importDialog').showModal();
    });
    bind('#selectAllImports','change',e=>document.querySelectorAll('#importList input').forEach(i=>i.checked=e.target.checked));
    bind('#confirmImportBtn','click',async()=>{const ids=[...document.querySelectorAll('#importList input:checked')].map(i=>i.dataset.id);if(!ids.length){toast('Choose at least one conversation.');return;}const result=await api.confirmImport(ids);memory=result.memory;$('#importDialog').close();renderMemory();toast(`${result.added} chat${result.added===1?'':'s'} imported. AI access starts off.`);});
    bind('#closeImportBtn','click',()=>$('#importDialog').close());
    bind('#closeContextBtn','click',()=>$('#contextDialog').close());
    bind('#previewContextBtn','click',async()=>{
      await calendar.persist();const p=await api.previewAI(request());$('#contextSources').textContent=`${p.model} · ${p.sources.map(s=>s.title).join(' · ')||'No saved context selected'}`;$('#contextBody').textContent=p.body+'\nQUESTION\n'+p.question;$('#contextDialog').showModal();
    });
    bind('#aiForm','submit',async e=>{
      e.preventDefault();if(busy)return;if(!memory.keyConfigured){page('settings');toast('Add an API key to use AI. No request has been sent.');return;}
      setBusy(true);
      try {await calendar.persist();const result=await api.askAI(request());threadId=result.threadId;attached=[];$('#aiQuestion').value='';await refresh();}
      finally {setBusy(false);await refresh();}
    });
    bind('#keyForm','submit',async e=>{e.preventDefault();const key=$('#apiKey').value.trim();if(!key){toast('Enter a key first.');return;}try{await api.configureKey(key);}finally{$('#apiKey').value='';}await refresh();toast('Key saved. No AI request was sent.');});
    bind('#removeKeyBtn','click',async()=>{await api.configureKey('');await refresh();toast('API key removed.');});
    bind('#limitForm','submit',async e=>{e.preventDefault();memory=await api.updateMemory({type:'limit',value:$('#requestLimit').value});renderSettings();toast('Request limit saved.');});
    bind('#exportContextBtn','click',async()=>{if(await api.exportMemory(false))toast('Context exported. You can attach it to a ChatGPT conversation.');});
    bind('#backupBtn','click',async()=>{await calendar.persist();if(await api.exportMemory(true))toast('Backup exported without your API key.');});
    if(api.getUpdates){
      renderUpdates(await api.getUpdates());
      api.onUpdateStatus?.(renderUpdates);
      bind('#checkUpdatesBtn','click',async()=>renderUpdates(await api.checkUpdates()));
      bind('#restartUpdateBtn','click',async()=>{await calendar.persist();await api.restartForUpdate();});
    }else $('#updateStatus').textContent='Use the installed Windows app for updates.';
    const info=await api.getAppInfo();
    $('#appVersion').textContent=`Better Calendar ${info.version} · ${info.installed ? 'Installed app' : 'Source preview — install the Windows app for everyday use'}`;
    await refresh();
  }
  window.Companion={init,renderProgress,toast,showPage:page};
})();
