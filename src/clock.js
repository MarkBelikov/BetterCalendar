(() => {
  'use strict';
  const time=document.querySelector('#clockTime'),date=document.querySelector('#clockDate');
  const timeFormat=new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit',second:'2-digit'});
  const dateFormat=new Intl.DateTimeFormat(undefined,{weekday:'long',month:'short',day:'numeric',year:'numeric'});
  function tick() {
    const now=new Date();
    time.textContent=timeFormat.format(now);
    time.dateTime=now.toISOString();
    date.textContent=dateFormat.format(now);
  }
  tick();
  const timer=setInterval(tick,1000);
  window.addEventListener('focus',tick);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});
  window.addEventListener('beforeunload',()=>clearInterval(timer));
})();
