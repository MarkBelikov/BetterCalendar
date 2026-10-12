(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);

  const els = {
    dayDialog: $('#dayDialog'),
    monthLabel: $('#monthLabel'),
    monthSummary: $('#monthSummary'),
    calendarGrid: $('#calendarGrid'),
    selectedDateLabel: $('#selectedDateLabel'),
    selectedEvents: $('#selectedEvents'),
    journalText: $('#journalText'),
    journalStatus: $('#journalStatus'),
    journalCount: $('#journalCount'),
    todoForm: $('#todoForm'),
    todoInput: $('#todoInput'),
    todoList: $('#todoList'),
    autoLaunchToggle: $('#autoLaunchToggle'),
    closeToTrayToggle: $('#closeToTrayToggle'),
    eventDialog: $('#eventDialog'),
    eventForm: $('#eventForm'),
    dialogTitle: $('#dialogTitle'),
    eventId: $('#eventId'),
    eventTitle: $('#eventTitle'),
    eventType: $('#eventType'),
    eventDate: $('#eventDate'),
    eventTime: $('#eventTime'),
    eventReminder: $('#eventReminder'),
    eventRecurrence: $('#eventRecurrence'),
    eventAmount: $('#eventAmount'),
    eventNotes: $('#eventNotes'),
    deleteEventBtn: $('#deleteEventBtn')
  };

  let state = {
    events: [],
    todos: [],
    journals: {},
    settings: { autoLaunch: true, closeToTray: true },
    completions: [],
    notified: {}
  };

  const now = new Date();
  let viewYear = now.getFullYear();
  let viewMonth = now.getMonth();
  let selectedDate = toDateKey(now);
  let journalSaveTimer = null;
  let schedulingTodoId = null;
  const Planner = window.PlannerCore;

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function toDateKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function parseDateKey(key) {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  function formatLongDate(key) {
    return parseDateKey(key).toLocaleDateString([], {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function formatShortDate(key) {
    return parseDateKey(key).toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function formatMoney(value) {
    if (value === '' || value === null || value === undefined) return '';
    const number = Number(value);
    return Number.isFinite(number) ? `$${number.toFixed(2)}` : '';
  }

  function uid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  let saveQueue = Promise.resolve();
  async function persist({replan=false,resetIds=[]}={}) {
    Planner.planTasks(state,{replan,resetIds});
    const snapshot = structuredClone(state);
    saveQueue = saveQueue.catch(() => {}).then(() => window.calendarAPI.saveData(snapshot));
    try { await saveQueue; }
    catch(error) { window.Companion.toast('Could not save: ' + error.message); throw error; }
  }
  function eventOccursOn(event, key) { return CalendarCore.occurs(event,key); }

  function eventsForDate(key) {
    return state.events
      .filter((event) => eventOccursOn(event, key))
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  }

  function renderCalendar() {
    const first = new Date(viewYear, viewMonth, 1);
    const start = new Date(viewYear, viewMonth, 1 - first.getDay());
    const monthName = first.toLocaleDateString([], { month: 'long', year: 'numeric' });

    els.monthLabel.textContent = monthName;

    const currentMonthEvents = state.events.filter((event) => {
      for (let day = 1; day <= new Date(viewYear, viewMonth + 1, 0).getDate(); day++) {
        if (eventOccursOn(event, `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`)) return true;
      }
      return false;
    }).length;

    els.monthSummary.textContent = `${currentMonthEvents} scheduled item${currentMonthEvents === 1 ? '' : 's'} • click any date to journal`;

    els.calendarGrid.innerHTML = '';
    const todayKey = toDateKey(new Date());

    for (let i = 0; i < 42; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const key = toDateKey(date);
      const events = eventsForDate(key);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'day';
      button.dataset.date = key;
      button.setAttribute('aria-label', `${formatLongDate(key)}, ${events.length} scheduled item${events.length === 1 ? '' : 's'}`);

      if (date.getMonth() !== viewMonth) button.classList.add('other');
      if (key === selectedDate) button.classList.add('selected');
      if (key === todayKey) button.classList.add('today');

      const dayTop = document.createElement('div');
      dayTop.style.display = 'flex';
      dayTop.style.alignItems = 'center';

      const number = document.createElement('span');
      number.className = 'day-number';
      number.textContent = date.getDate();
      dayTop.appendChild(number);

      if (state.journals[key] && state.journals[key].trim()) {
        const dot = document.createElement('span');
        dot.className = 'journal-dot';
        dot.title = 'Journal entry exists';
        dayTop.appendChild(dot);
      }

      button.appendChild(dayTop);

      const items = document.createElement('div');
      items.className = 'day-items';

      events.slice(0, 3).forEach((event) => {
        const item = document.createElement('span');
        item.className = `day-item ${event.type || 'reminder'}`;
        const amount = event.amount ? ` ${formatMoney(event.amount)}` : '';
        const status=event.type==='subscription-cancelled'?'Cancelled · ':event.type==='subscription-renewed'?'Renewed · ':`${event.time || ''} `;
        item.textContent = `${status}${event.title}${amount}`.trim();
        items.appendChild(item);
      });

      if (events.length > 3) {
        const more = document.createElement('span');
        more.className = 'more-label';
        more.textContent = `+${events.length - 3} more`;
        items.appendChild(more);
      }

      if (state.journals[key]?.trim()) {
        const preview=document.createElement('span');preview.className='day-journal-preview';
        preview.textContent=state.journals[key].trim().replace(/\s+/g,' ');items.appendChild(preview);
      }
      button.appendChild(items);
      button.addEventListener('click', () => selectDate(key));
      els.calendarGrid.appendChild(button);
    }
  }

  function selectDate(key, open = true) {
    selectedDate = key;
    const date = parseDateKey(key);
    viewYear = date.getFullYear();
    viewMonth = date.getMonth();
    els.selectedDateLabel.textContent = formatLongDate(key);
    els.journalText.value = state.journals[key] || '';
    updateJournalCount();
    renderCalendar();
    renderSelectedEvents();
    if(open){if(!els.dayDialog.open)els.dayDialog.showModal();els.journalText.focus();}
  }

  async function closeDay() {
    clearTimeout(journalSaveTimer);
    try {await persist();els.journalStatus.textContent='Saved locally';els.dayDialog.close();renderCalendar();}
    catch(error){window.Companion.toast('Could not save your journal: '+error.message);}
  }

  function renderSelectedEvents() {
    const events = eventsForDate(selectedDate);
    els.selectedEvents.innerHTML = '';

    if (!events.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'Nothing scheduled for this date.';
      els.selectedEvents.appendChild(empty);
      return;
    }

    events.forEach((event) => {
      const card = document.createElement('div');
      card.className = 'event-card';

      const info = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = event.title;
      info.appendChild(title);

      const meta = document.createElement('div');
      meta.className = 'event-meta';
      const bits = [
        event.time || '09:00',
        event.type === 'subscription' ? 'Payment' : event.type === 'subscription-cancelled' ? 'Subscription cancelled' : event.type === 'subscription-renewed' ? 'Subscription renewed' : event.type === 'task-block' ? `Task block · ${event.durationMinutes||30} min` : event.type === 'event' ? 'Event' : 'Reminder',
        event.amount ? formatMoney(event.amount) : '',
        event.recurrence && event.recurrence !== 'none' ? `Repeats ${event.recurrence}` : '',
        event.recordOnly ? 'Activity record — no notification' : reminderLabel(event.reminder)
      ].filter(Boolean);
      meta.textContent = bits.join(' • ');
      if (event.notes) meta.textContent += `\n${event.notes}`;
      info.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'event-actions';

      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'mini-btn';
      edit.textContent = 'Edit';
      edit.addEventListener('click', () => openEventDialog(event));
      actions.appendChild(edit);

      card.append(info, actions);
      els.selectedEvents.appendChild(card);
    });
  }

  function reminderLabel(value) {
    const labels = {
      '7d': '7 days early',
      '3d': '3 days early',
      '1d': '1 day early',
      '2h': '2 hours early',
      '30m': '30 min early',
      '0m': 'At time'
    };
    return labels[value || '1d'];
  }

  function renderTodos() {
    const sorted = [...state.todos].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return Planner.priority(a).rank-Planner.priority(b).rank;
    });

    if (window.Companion) window.Companion.renderProgress(state);
    if (window.LifeUI) window.LifeUI.updateCalendar(state);
    els.todoList.innerHTML = '';

    if (!sorted.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'Your to-do list is empty.';
      els.todoList.appendChild(empty);
      return;
    }

    sorted.forEach((todo) => {
      const row = document.createElement('div');
      row.className = `todo${todo.completed ? ' done' : ''}`;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = Boolean(todo.completed);
      checkbox.setAttribute('aria-label', `Mark ${todo.text} complete`);
      checkbox.addEventListener('change', async () => {
        const target = state.todos.find((item) => item.id === todo.id);
        if (target) {
          target.completed = checkbox.checked;
          state.completions = (state.completions || []).filter(c=>c.todoId!==target.id);
          if (target.completed) state.completions.push({todoId:target.id,date:toDateKey(new Date()),text:target.text});
        }
        await persist({replan:true});
        renderTodos();
      });

      const textWrap = document.createElement('div');
      const text = document.createElement('div');
      text.className = 'todo-text';
      text.textContent = todo.text;
      textWrap.appendChild(text);
      if(!todo.completed&&todo.plan){
        const plan=todo.plan,detail=document.createElement('div');detail.className='todo-plan';
        const end=Planner.planEnd(plan),missed=Number.isFinite(end)&&end<Date.now();
        const title=document.createElement('strong');title.className=missed?'plan-missed':'';
        title.textContent=Number.isFinite(end)?`${missed?'Past suggested deadline':'Suggested finish'} · ${new Date(end).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}`:'No free slot in the next 14 days';
        detail.append(title);
        const explanation=document.createElement('span');explanation.textContent=`${plan.label} priority · about ${plan.minutes} min${plan.source==='calendar'?' · On your calendar':''}`;detail.append(explanation);
        const why=document.createElement('span');why.className='plan-why';why.textContent=plan.reason;detail.append(why);
        detail.title=(plan.estimateReason||'Uses your calendar block.')+' Starting estimate; larger tasks may need more sessions.';
        textWrap.append(detail);
      }

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'todo-delete';
      del.textContent = '×';
      del.setAttribute('aria-label', `Delete ${todo.text}`);
      del.addEventListener('click', async () => {
        state.todos = state.todos.filter((item) => item.id !== todo.id);
        await persist({replan:true});
        renderTodos();
      });

      const pin = document.createElement('button');
      pin.type = 'button';pin.className = `todo-pin${todo.pinned ? ' pinned' : ''}`;pin.textContent = todo.pinned ? '★' : '☆';
      pin.setAttribute('aria-label', `${todo.pinned ? 'Unpin' : 'Pin'} ${todo.text}`);
      pin.addEventListener('click', async () => {todo.pinned = !todo.pinned;await persist();renderTodos();});
      const tools = document.createElement('div');tools.className = 'todo-tools';tools.append(pin);
      if(!todo.completed){const schedule=document.createElement('button');schedule.type='button';schedule.className='mini-btn todo-schedule';schedule.textContent='Suggest time';schedule.setAttribute('aria-label',`Suggest a time for ${todo.text}`);schedule.addEventListener('click',()=>openSchedule(todo));tools.append(schedule);const adjust=document.createElement('button');adjust.type='button';adjust.className='mini-btn todo-schedule';adjust.textContent='Adjust plan';adjust.addEventListener('click',()=>openTaskPlan(todo));tools.append(adjust);}
      tools.append(del);
      row.append(checkbox, textWrap, tools);
      els.todoList.appendChild(row);
    });
  }

  function updateJournalCount() {
    const count = els.journalText.value.length;
    els.journalCount.textContent = `${count} character${count === 1 ? '' : 's'}`;
  }

  function queueJournalSave() {
    updateJournalCount();
    const date = selectedDate, value = els.journalText.value;
    // Capture the date immediately, so navigating never moves an entry to another day.
    if (value.trim()) state.journals[date] = value;
    else delete state.journals[date];
    els.journalStatus.textContent = 'Saving…';
    clearTimeout(journalSaveTimer);
    journalSaveTimer = setTimeout(async () => {
      try { await persist(); els.journalStatus.textContent = 'Saved locally'; renderCalendar(); }
      catch (_) { els.journalStatus.textContent = 'Save failed — retry by typing'; }
    }, 250);
  }

  function openEventDialog(event = null) {
    els.eventForm.reset();
    const related=$('#relatedSubscription');related.replaceChildren(new Option('Record only',''));
    state.events.filter(e=>e.type==='subscription').forEach(e=>related.add(new Option(e.title+(e.endedOn?' (stopped)':''),e.id)));
    $('#eventDuration').value=event?.durationMinutes||30;
    $('#subscriptionEnd').value=event?.endedOn||'';
    related.value=event?.relatedSubscription||'';
    els.eventTime.value = '09:00';
    els.eventReminder.value = '1d';
    els.eventRecurrence.value = 'none';

    if (event) {
      els.dialogTitle.textContent = 'Edit calendar entry';
      els.eventId.value = event.id;
      els.eventTitle.value = event.title || '';
      els.eventType.value = event.type || 'reminder';
      els.eventDate.value = event.date || selectedDate;
      els.eventTime.value = event.time || '09:00';
      els.eventReminder.value = event.reminder || '1d';
      els.eventRecurrence.value = event.recurrence || 'none';
      els.eventAmount.value = event.amount ?? '';
      els.eventNotes.value = event.notes || '';
      els.deleteEventBtn.classList.remove('hidden');
    } else {
      els.dialogTitle.textContent = 'Add reminder';
      els.eventId.value = '';
      els.eventDate.value = selectedDate;
      els.deleteEventBtn.classList.add('hidden');
    }

    syncEntryType();
    els.eventDialog.showModal();
    setTimeout(() => els.eventTitle.focus(), 20);
  }

  function syncEntryType() {
    const record=['subscription-cancelled','subscription-renewed'].includes(els.eventType.value);
    $('#subscriptionLinkField').classList.toggle('hidden',!record);
    $('#subscriptionEndField').classList.toggle('hidden',els.eventType.value!=='subscription');
    els.eventRecurrence.disabled=record;els.eventReminder.disabled=record;
    if(record){els.eventRecurrence.value='none';els.eventReminder.value='0m';}
    $('#subscriptionLinkHint').textContent=els.eventType.value==='subscription-cancelled'?'Choosing a subscription stops its future scheduled payments from this date. This only records the cancellation locally; it does not cancel a service for you.':'A renewal is an activity record. It does not create an extra recurring payment.';
  }

  async function saveEvent() {
    const title = els.eventTitle.value.trim();
    const date = els.eventDate.value;
    if (!title || !date) return;

    const previous=state.events.find(e=>e.id===els.eventId.value);
    const recordOnly=['subscription-cancelled','subscription-renewed'].includes(els.eventType.value);
    const event = {
      ...previous,
      id: els.eventId.value || uid(),
      title,
      type: els.eventType.value,
      date,
      time: els.eventTime.value || '09:00',
      reminder: els.eventReminder.value,
      recurrence: els.eventRecurrence.value,
      amount: els.eventAmount.value === '' ? '' : Number(els.eventAmount.value),
      notes: els.eventNotes.value.trim(),
      completed: false,
      durationMinutes:Number($('#eventDuration').value)||30,
      recordOnly,
      relatedSubscription:recordOnly?$('#relatedSubscription').value:'',
      endedOn:els.eventType.value==='subscription'?($('#subscriptionEnd').value||undefined):undefined
    };

    const index = state.events.findIndex((item) => item.id === event.id);
    if (index >= 0) state.events[index] = event;
    else state.events.push(event);

    if(event.type==='subscription-cancelled'&&event.relatedSubscription){const linked=state.events.find(e=>e.id===event.relatedSubscription&&e.type==='subscription');if(linked)linked.endedOn=date;}

    // Editing a reminder should allow it to notify again if details changed.
    for (const key of Object.keys(state.notified || {})) {
      if (key.startsWith(`${event.id}:`)) delete state.notified[key];
    }

    await persist({replan:true});
    selectedDate = date;
    const parsed = parseDateKey(date);
    viewYear = parsed.getFullYear();
    viewMonth = parsed.getMonth();
    renderAll();
    els.eventDialog.close();
  }

  async function deleteCurrentEvent() {
    const id = els.eventId.value;
    if (!id) return;
    state.events = state.events.filter((event) => event.id !== id);
    for (const key of Object.keys(state.notified || {})) {
      if (key.startsWith(`${id}:`)) delete state.notified[key];
    }
    await persist({replan:true});
    renderAll();
    els.eventDialog.close();
  }

  let editingPlanId=null;
  function openTaskPlan(todo){
    editingPlanId=todo.id;$('#taskPlanTitle').textContent=todo.text;
    $('#taskPlanMinutes').value=todo.plan?.minutes||Planner.estimate(todo.text).minutes;
    $('#taskPlanPriority').value=Number.isInteger(todo.planPriority)?String(todo.planPriority):'auto';
    $('#taskPlanDialog').showModal();
  }
  async function saveTaskPlan(event){
    event.preventDefault();const todo=state.todos.find(t=>t.id===editingPlanId);if(!todo)return;
    const minutes=Number($('#taskPlanMinutes').value);if(!Number.isInteger(minutes)||minutes<5||minutes>240)return;
    todo.planMinutes=minutes;const rank=$('#taskPlanPriority').value;
    if(rank==='auto')delete todo.planPriority;else todo.planPriority=Number(rank);
    await persist({replan:true,resetIds:[todo.id]});renderTodos();$('#taskPlanDialog').close();
    window.Companion.toast(todo.plan?.source==='calendar'?'Your existing calendar block stays fixed. Use Suggest time to move it.':'Plan updated using your list and availability.');
  }
  async function resetTaskPlan(){
    const todo=state.todos.find(t=>t.id===editingPlanId);if(!todo)return;
    delete todo.planMinutes;delete todo.planPriority;
    await persist({replan:true,resetIds:[todo.id]});renderTodos();$('#taskPlanDialog').close();
  }

  function openSchedule(todo) {
    schedulingTodoId=todo.id;$('#scheduleTitle').textContent=todo.text;
    $('#scheduleMinutes').value=todo.plan?.minutes||Planner.estimate(todo.text).minutes;
    $('#scheduleDate').min=toDateKey(new Date());refreshSuggestions();$('#scheduleDialog').showModal();
  }
  function refreshSuggestions() {
    const todo=state.todos.find(t=>t.id===schedulingTodoId);if(!todo)return;
    const minutes=Number($('#scheduleMinutes').value),slots=Planner.suggestions(state,todo,{minutes}),container=$('#suggestedSlots');container.replaceChildren();
    $('#scheduleReason').textContent='Local suggestion · '+Planner.estimate(todo.text).reason+' Uses your free-time windows and saved calendar.';
    const recommended=todo.plan;if(recommended?.date&&Planner.planEnd(recommended)-recommended.minutes*60000>Date.now()&&!Planner.conflict(state,recommended,todo.id)&&recommended.minutes===minutes){const index=slots.findIndex(s=>s.date===recommended.date&&s.time===recommended.time);if(index>=0)slots.splice(index,1);slots.unshift({date:recommended.date,time:recommended.time,minutes});}
    const choose=slot=>{$('#scheduleDate').value=slot.date;$('#scheduleTime').value=slot.time;for(const b of container.children)b.classList.toggle('selected',b.dataset.date===slot.date&&b.dataset.time===slot.time);};
    for(const slot of slots){const b=document.createElement('button');b.type='button';b.className='slot-choice';b.dataset.date=slot.date;b.dataset.time=slot.time;b.textContent=`${formatLongDate(slot.date)} · ${slot.time} · ${slot.minutes} min`;b.addEventListener('click',()=>choose(slot));container.append(b);}
    if(slots.length)choose(slots[0]);else{container.textContent='No matching slot in the next 14 days. Try a shorter block, adjust availability, or choose a time below.';$('#scheduleDate').value=toDateKey(new Date());$('#scheduleTime').value='18:00';}
  }
  async function saveSchedule(event) {
    event.preventDefault();const todo=state.todos.find(t=>t.id===schedulingTodoId);if(!todo||todo.completed)return;
    const slot={date:$('#scheduleDate').value,time:$('#scheduleTime').value,minutes:Number($('#scheduleMinutes').value)},start=parseDateKey(slot.date);const [h,m]=slot.time.split(':').map(Number);start.setHours(h,m,0,0);
    if(!Number.isFinite(start.getTime())||start<=new Date()||slot.minutes<5||slot.minutes>240){window.Companion.toast('Choose a future time and 5–240 minutes.');return;}
    if(toDateKey(new Date(start.getTime()+slot.minutes*60000))!==slot.date){window.Companion.toast('Choose a block that finishes before midnight.');return;}
    if(Planner.conflict(state,slot,todo.id)){window.Companion.toast('That slot overlaps a calendar entry. Choose another time.');return;}
    const existing=state.events.find(e=>e.type==='task-block'&&e.todoId===todo.id&&e.date>=toDateKey(new Date())&&!e.completed);
    const block={id:existing?.id||uid(),title:todo.text,type:'task-block',todoId:todo.id,date:slot.date,time:slot.time,durationMinutes:slot.minutes,reminder:'30m',recurrence:'none',completed:false,notes:'A time to start. The task stays on your permanent list until completed.'};
    if(existing)Object.assign(existing,block);else state.events.push(block);
    await persist({replan:true});renderAll();$('#scheduleDialog').close();window.Companion.toast('Time reserved. Your task stays on the permanent list.');
  }

  function renderAll() {
    els.selectedDateLabel.textContent = formatLongDate(selectedDate);
    els.journalText.value = state.journals[selectedDate] || '';
    updateJournalCount();
    renderCalendar();
    renderSelectedEvents();
    renderTodos();
    els.closeToTrayToggle.checked = Boolean(state.settings.closeToTray);
  }

  async function init() {
    state = await window.calendarAPI.getData();
    els.autoLaunchToggle.checked = await window.calendarAPI.getAutoLaunch();
    state.settings.autoLaunch = els.autoLaunchToggle.checked;


    for(const key of Object.keys(Planner.WINDOWS))$('#'+key).value=state.settings.availability?.[key]||Planner.WINDOWS[key];
    $('#availabilityForm').addEventListener('submit',async event=>{event.preventDefault();const value=Object.fromEntries(Object.keys(Planner.WINDOWS).map(key=>[key,$('#'+key).value]));if(!Planner.validWindows(value)){window.Companion.toast('Each window must end after it starts, on the same day.');return;}state.settings.availability=value;await persist({replan:true});renderTodos();window.Companion.toast('Availability saved.');});
    $('#closeDayBtn').addEventListener('click',closeDay);
    els.dayDialog.addEventListener('cancel',event=>{event.preventDefault();closeDay();});
    els.dayDialog.addEventListener('click',event=>{if(event.target!==els.dayDialog)return;const r=els.dayDialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeDay();});
    els.eventType.addEventListener('change',syncEntryType);
    $('#relatedSubscription').addEventListener('change',()=>{const linked=state.events.find(e=>e.id===$('#relatedSubscription').value);if(linked&&!els.eventTitle.value.trim())els.eventTitle.value=linked.title;});
    $('#closeTaskPlanBtn').addEventListener('click',()=>$('#taskPlanDialog').close());
    $('#taskPlanForm').addEventListener('submit',saveTaskPlan);
    $('#resetTaskPlanBtn').addEventListener('click',resetTaskPlan);
    $('#closeScheduleBtn').addEventListener('click',()=>$('#scheduleDialog').close());
    $('#refreshSlotsBtn').addEventListener('click',refreshSuggestions);
    $('#scheduleForm').addEventListener('submit',saveSchedule);
    $('#prevMonthBtn').addEventListener('click', () => {
      viewMonth--;
      if (viewMonth < 0) { viewMonth = 11; viewYear--; }
      renderCalendar();
    });

    $('#nextMonthBtn').addEventListener('click', () => {
      viewMonth++;
      if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      renderCalendar();
    });

    $('#todayBtn').addEventListener('click', () => {
      const today = new Date();
      selectDate(toDateKey(today));
    });

    $('#newEventBtn').addEventListener('click', () => openEventDialog());
    $('#addSelectedEventBtn').addEventListener('click', () => openEventDialog());
    $('#closeDialogBtn').addEventListener('click', () => els.eventDialog.close());
    $('#cancelEventBtn').addEventListener('click', () => els.eventDialog.close());

    els.eventForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      await saveEvent();
    });

    els.deleteEventBtn.addEventListener('click', deleteCurrentEvent);

    els.journalText.addEventListener('input', queueJournalSave);

    els.todoForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const text = els.todoInput.value.trim();
      if (!text) return;
      state.todos.push({
        id: uid(),
        text,
        completed: false,
        createdAt: Date.now()
      });
      els.todoInput.value = '';
      await persist({replan:true});
      renderTodos();
      els.todoInput.focus();
    });

    $('#clearCompletedBtn').addEventListener('click', async () => {
      state.todos = state.todos.filter((todo) => !todo.completed);
      await persist();
      renderTodos();
    });

    els.autoLaunchToggle.addEventListener('change', async () => {
      const actual = await window.calendarAPI.setAutoLaunch(els.autoLaunchToggle.checked);
      els.autoLaunchToggle.checked = actual;
      state.settings.autoLaunch = actual;
      await persist();
    });

    els.closeToTrayToggle.addEventListener('change', async () => {
      state.settings.closeToTray = els.closeToTrayToggle.checked;
      await persist();
    });

    $('#testNotificationBtn').addEventListener('click', async () => {
      await window.calendarAPI.showNotification(
        'Better Calendar',
        'Notifications are working. Your future reminders will appear like this.'
      );
    });

    $('#quitAppBtn').addEventListener('click', async () => {
      clearTimeout(journalSaveTimer);
      await persist();
      window.calendarAPI.quit();
    });

    if(Planner.planTasks(state))await persist();
    await window.Companion.init({getState:()=>state,persist});
    renderAll();
    try {await window.LifeUI.init({getState:()=>state,
      updateTask:async(id,patch)=>{
        const target=state.todos.find(t=>t.id===id);if(!target)return;
        Object.assign(target,patch);
        if(patch.completed!==undefined){state.completions=(state.completions||[]).filter(c=>c.todoId!==id);if(patch.completed)state.completions.push({todoId:id,date:toDateKey(new Date()),text:target.text});}
        await persist({replan:true});renderAll();
      },
      openDate:key=>{selectDate(key);window.Companion.showPage('calendar');},
      scheduleFollowUp:async item=>{
        if(item.followUpDate<toDateKey(new Date()))throw new Error('Set today or a future follow-up date before adding a calendar reminder.');
        const existing=state.events.find(e=>e.careerId===item.id);
        const event={id:existing?.id||uid(),title:`Follow up: ${item.company} — ${item.role}`,date:item.followUpDate,time:'09:00',type:'reminder',reminder:'0m',recurrence:'none',notes:item.nextAction,careerId:item.id};
        if(existing)Object.assign(existing,event);else state.events.push(event);
        await persist({replan:true});renderAll();
      }
    });}catch(error){window.Companion.toast('Trackers could not load: '+error.message);}
    window.addEventListener('beforeunload', () => {clearTimeout(journalSaveTimer);window.calendarAPI.saveData(structuredClone(state));});
  }

  init().catch((error) => {
    console.error(error);
    const message = document.createElement('p');
    message.textContent = 'Better Calendar could not start: ' + String(error.message || error);
    document.body.replaceChildren(message);
  });
})();
