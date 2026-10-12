// Shared date rules used by the calendar, notifications, and AI context.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CalendarCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const dayMs = 86400000;
  const key = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const parse = k => { const [y,m,d] = String(k).split('-').map(Number); return new Date(y,m-1,d); };
  function occurs(e, k) {
    if (!e.date || k < e.date || e.completed || (e.endedOn && k >= e.endedOn)) return false;
    if (!e.recurrence || e.recurrence === 'none') return e.date === k;
    const b = parse(e.date), d = parse(k);
    const last = new Date(d.getFullYear(),d.getMonth()+1,0).getDate();
    if (e.recurrence === 'yearly' && b.getMonth() !== d.getMonth()) return false;
    return ['monthly','yearly'].includes(e.recurrence) && d.getDate() === Math.min(b.getDate(),last);
  }
  function occurrences(e, start, end) {
    const out = [];
    const d = new Date(start.getFullYear(),start.getMonth(),start.getDate());
    for (let guard=0; d <= end && guard<400; guard++, d.setDate(d.getDate()+1)) {
      if (occurs(e,key(d))) {
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
    const payments = (data.events || []).filter(e=>e.type==='subscription').flatMap(e => occurrences(e,now,new Date(now.getTime()+30*dayMs)).map(d=>({...e,occurrence:key(d)}))).sort((a,b)=>a.occurrence.localeCompare(b.occurrence));
    return { completed:completed.length, journalDays, payments, paymentTotal:payments.reduce((n,e)=>n+(Number(e.amount)||0),0), open:(data.todos||[]).filter(t=>!t.completed).length };
  }
  return { key, parse, occurs, occurrences, progress, dayMs };
});
