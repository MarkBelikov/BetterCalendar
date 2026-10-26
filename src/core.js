// Shared date rules used by the calendar, notifications, and AI context.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CalendarCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const dayMs = 86400000;
  const key = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const parse = k => { const [y,m,d] = String(k).split('-').map(Number); return new Date(y,m-1,d); };
  // Calendar history includes completed entries; active reminders exclude them.
  function scheduledOn(e, k) {
    if (!e.date || k < e.date || (e.endedOn && k >= e.endedOn)) return false;
    if (!e.recurrence || e.recurrence === 'none') return e.date === k;
    const b = parse(e.date), d = parse(k);
    const last = new Date(d.getFullYear(),d.getMonth()+1,0).getDate();
    if (e.recurrence === 'yearly' && b.getMonth() !== d.getMonth()) return false;
    return ['monthly','yearly'].includes(e.recurrence) && d.getDate() === Math.min(b.getDate(),last);
  }
  function isCompleted(e, k, todos = []) {
    if (e.type === 'task-block' && todos.some(t => t.id === e.todoId && t.completed)) return true;
    if (Object.prototype.hasOwnProperty.call(e.completedDates || {}, k)) return Boolean(e.completedDates[k]);
    return Boolean(e.completed);
  }
  function occurs(e, k, todos = []) { return scheduledOn(e, k) && !isCompleted(e, k, todos); }
  function setCompleted(e, k, completed) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || key(parse(k)) !== k || !scheduledOn(e, k)) throw new Error('Choose a date on which this reminder is scheduled.');
    e.completedDates = {...e.completedDates, [k]: Boolean(completed)};
  }
  function setTodoCompleted(data, todoId, completed, date = key(new Date())) {
    const todo = (data.todos || []).find(t => t.id === todoId);
    if (!todo) throw new Error('Task not found.');
    todo.completed = Boolean(completed);
    data.completions = (data.completions || []).filter(c => c.todoId !== todoId);
    if (todo.completed) data.completions.push({todoId, date, text: todo.text});
    // Retain the checked calendar history even after completed tasks are cleared.
    for (const e of data.events || []) if (e.type === 'task-block' && e.todoId === todoId && scheduledOn(e, e.date)) setCompleted(e, e.date, completed);
  }
  function occurrences(e, start, end, {includeCompleted = false, todos = []} = {}) {
    const out = [];
    const d = new Date(start.getFullYear(),start.getMonth(),start.getDate());
    for (let guard=0; d <= end && guard<400; guard++, d.setDate(d.getDate()+1)) {
      if (scheduledOn(e,key(d)) && (includeCompleted || !isCompleted(e,key(d),todos))) {
        const [h,m] = (e.time || '09:00').split(':').map(Number);
        const due = new Date(d.getFullYear(),d.getMonth(),d.getDate(),h,m);
        if (due >= start && due <= end) out.push(due);
      }
    }
    return out;
  }
  function progress(data, now = new Date()) {
    const today = key(now), start = new Date(now.getFullYear(),now.getMonth(),now.getDate()-6);
    const startKey = key(start);
    const completed = (data.completions || []).filter(c => c.date >= startKey && c.date <= today);
    const journalDays = Object.keys(data.journals || {}).filter(k=>k>=startKey && k<=today && data.journals[k].trim()).length;
    const payments = (data.events || []).filter(e=>e.type==='subscription').flatMap(e => occurrences(e,now,new Date(now.getTime()+30*dayMs),{todos:data.todos}).map(d=>({...e,occurrence:key(d)}))).sort((a,b)=>a.occurrence.localeCompare(b.occurrence));
    return { completed:completed.length, journalDays, payments, paymentTotal:payments.reduce((n,e)=>n+(Number(e.amount)||0),0), open:(data.todos||[]).filter(t=>!t.completed).length };
  }
  return { key, parse, scheduledOn, isCompleted, setCompleted, setTodoCompleted, occurs, occurrences, progress, dayMs };
});
