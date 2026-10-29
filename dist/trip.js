import {finite,number,clock,dateKey,direction,weather,assess,NZ_ZONE} from './forecast.js';
import {quantity,formatValue,unitLabel} from './units.js';
import {icon} from './icons.js';
import {read,write} from './storage.js';
import {confidenceLevel} from './blend.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dayName=ts=>new Intl.DateTimeFormat('en-NZ',{timeZone:NZ_ZONE,weekday:'short',day:'numeric',month:'short'}).format(new Date(ts*1000));
export function nzDateInput(ts){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:NZ_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ts*1000)).map(p=>[p.type,p.value]));return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;}
export function parseNZInput(value){
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value))return null;
  const stamp=Date.parse(value+'Z')/1000;if(!finite(stamp))return null;
  // Main NZ waters use NZST/NZDT. Round-trip validation rejects skipped
  // spring hours and invalid dates; the first repeated autumn hour is used.
  return [13,12].map(h=>stamp-h*3600).find(ts=>nzDateInput(ts)===value)??null;
}
export function summariseTrip(rows,daily,settings,start,end){
  if(!finite(start)||!finite(end)||end<=start)throw Error('Choose a valid trip window.');
  const selected=rows.filter(r=>r.ts<end&&r.ts+3600>start).sort((a,b)=>a.ts-b.ts);
  let cursor=start,covered=true;for(const r of selected){if(r.ts>cursor)covered=false;cursor=Math.max(cursor,r.ts+3600);}if(cursor<end)covered=false;
  const max=(key,conservative=false)=>{const values=selected.map(r=>conservative?r.blend?.fields?.[key]?.max??r[key]:r[key]).filter(finite);return values.length?Math.max(...values):null;};
  const wind=selected.map(r=>r.wind).filter(finite),ratings=selected.map(r=>assess(r,settings));
  let lit=start;for(const [i]of (daily?.time||[]).entries()){const a=daily.sunrise?.[i],b=daily.sunset?.[i];if(finite(a)&&finite(b)&&a<=lit&&b>lit)lit=b;}
  const wantedDays=new Set([dateKey(start),dateKey(end-1)]);for(let t=start;t<end;t+=3600)wantedDays.add(dateKey(t));
  const daylightKnown=[...wantedDays].every(key=>(daily?.time||[]).some((t,i)=>dateKey(t)===key&&finite(daily.sunrise?.[i])&&finite(daily.sunset?.[i])));
  const darkness=daylightKnown&&lit<end,above=ratings.filter(r=>r.kind==='above').length,unknown=ratings.filter(r=>r.kind==='unknown').length;
  const scores=selected.filter(r=>r.blend).map(r=>r.blend.score),confidence=scores.length&&scores.every(finite)?Math.min(...scores):null;
  return {rows:selected,covered,darkness,daylightKnown,above,unknown,confidence,windMin:wind.length?Math.min(...wind):null,windMax:max('wind'),gust:max('gust',true),wave:max('wave',true),rain:max('rain',true),kind:above||darkness&&settings.daylightOnly?'above':!covered||unknown||!daylightKnown&&settings.daylightOnly?'unknown':'within'};
}
export function hourlyList(rows,settings){
  if(!rows.length)return '<p class="empty-state">No hours available for this time.</p>';
  return `<table class="day-hours"><caption class="sr-only">Hourly conditions. Choose a time for the full forecast.</caption><thead><tr><th scope="col">Time <small>NZ</small></th><th scope="col">Wind <small>${unitLabel('speed',settings)}</small></th><th scope="col">Gusts <small>${unitLabel('speed',settings)}</small></th><th scope="col">Waves <small>${unitLabel('height',settings)}</small></th><th scope="col">Rain <small>%</small></th></tr></thead><tbody>${rows.map((r,i)=>{const w=weather(r.code),newDay=i===0||dateKey(rows[i-1].ts)!==dateKey(r.ts),label=dayName(r.ts)+' '+clock(r.ts);return `${newDay?`<tr class="list-date"><th colspan="5" scope="rowgroup">${esc(dayName(r.ts))}</th></tr>`:''}<tr data-hour-detail="${r.ts}"><th scope="row"><button type="button" data-hour-detail="${r.ts}" aria-label="Details for ${esc(label)}"><span class="list-weather" title="${w.label}">${icon(r.isDay===0&&w.icon==='sun'?'moon':w.icon)}</span><time>${clock(r.ts).replace(':00','').replace(' am','a').replace(' pm','p')}</time></button></th><td>${formatValue(r.wind,'speed',settings)}<small>${finite(r.dir)?direction(r.dir):''}</small></td><td>${formatValue(r.gust,'speed',settings)}</td><td>${formatValue(r.wave,'height',settings)}</td><td>${number(r.rain)}</td></tr>`;}).join('')}</tbody></table>`;
}
export function initTripPlanner({get}){
  const $=s=>document.querySelector(s),form=$('#trip-form'),dialog=$('#trip-dialog');
  const saved=read('trip-window',{}),future=saved.start>Date.now()/1000,start=future?saved.start:Math.ceil(Date.now()/3600000)*3600;
  form.elements.start.value=nzDateInput(start);form.elements.duration.value=finite(saved.duration)&&saved.duration>=.5&&saved.duration<=72?saved.duration:4;
  let active;
  const paint=()=>{
    const {data,settings,spot,offline,error}=get();if(!active||!data)return;
    const summary=summariseTrip(data.rows,data.daily,settings,active.start,active.end),stale=offline||error||Date.now()-data.fetchedAt>6*3600000;
    $('#trip-date-label').textContent=(spot?.name?spot.name+' · ':'')+dayName(active.start);
    $('#trip-time-label').textContent=`${clock(active.start)}–${clock(active.end)}${dateKey(active.start)!==dateKey(active.end)?' · '+dayName(active.end):''} · NZ time`;
    const note=$('#trip-condition-note');note.dataset.kind=stale?'unknown':summary.kind;
    const messages=[];if(summary.above)messages.push(`${summary.above} of ${summary.rows.length} hourly forecasts exceed your limits.`);if(!summary.covered)messages.push('Part of this trip has no forecast yet.');if(summary.unknown)messages.push(`${summary.unknown} hourly forecast${summary.unknown===1?' is':'s are'} incomplete or below your confidence limit.`);if(summary.darkness&&settings.daylightOnly)messages.push('Part of this trip is outside daylight.');
    if(!summary.daylightKnown&&settings.daylightOnly)messages.push('Daylight times are unavailable.');
    note.textContent=stale?'Saved forecast · refresh before relying on this plan.':messages.join(' ')||'The hourly forecast matches your selected limits.';
    const stat=(label,value)=>`<div><span>${label}</span><strong>${value}</strong></div>`;
    $('#trip-summary').innerHTML=stat('Wind forecast',`${formatValue(summary.windMin,'speed',settings)}–${formatValue(summary.windMax,'speed',settings)} <small>${unitLabel('speed',settings)}</small>`)+stat('Highest gust',quantity(summary.gust,'speed',settings))+stat('Highest waves',quantity(summary.wave,'height',settings))+stat('Blend confidence',summary.rows.some(r=>r.blend)?confidenceLevel(summary.confidence):'Single model');
    $('#trip-hours').innerHTML=hourlyList(summary.rows,settings);
    $('#trip-daylight-note').textContent=!summary.daylightKnown?'Daylight times are unavailable.':summary.darkness?'Includes time outside daylight.':'Within the published daylight hours.';
    $('#trip-daylight-note').hidden=settings.daylightOnly&&(summary.darkness||!summary.daylightKnown);
  };
  const refresh=()=>{
    const {data}=get(),start=parseNZInput(form.elements.start.value),hours=Number(form.elements.duration.value);
    form.elements.start.min=nzDateInput(Math.ceil(Date.now()/60000)*60);
    if(data?.rows.length&&finite(hours)&&hours>0)form.elements.start.max=nzDateInput(data.rows.at(-1).ts+3600-hours*3600);else form.elements.start.removeAttribute('max');
    form.elements.start.setCustomValidity(form.elements.start.value&&start===null?'That time does not exist in New Zealand. Choose another time.':'');
    $('#trip-open').disabled=!data;
    $('#trip-hint').textContent=start!==null&&finite(hours)&&hours>0?`Back at ${clock(start+hours*3600)}${dateKey(start)!==dateKey(start+hours*3600)?' · '+dayName(start+hours*3600):''} · NZ time`:'Choose when you’re leaving and how long you’ll be out.';
    if(dialog.open)paint();
  };
  form.addEventListener('input',refresh);
  form.addEventListener('submit',e=>{e.preventDefault();refresh();if(!form.reportValidity()||!get().data)return;const start=parseNZInput(form.elements.start.value),duration=Number(form.elements.duration.value);active={start,end:start+duration*3600};write('trip-window',{start,duration});paint();dialog.showModal();});
  document.addEventListener('click',e=>{const button=e.target.closest('[data-hour-detail]');if(!button)return;const {data,settings}=get(),row=data?.rows.find(r=>r.ts===Number(button.dataset.hourDetail));if(!row)return;
    $('#hour-title').textContent=clock(row.ts);$('#hour-date').textContent=dayName(row.ts)+' · NZ time · '+weather(row.code).label;
    const stat=(label,value)=>`<div><dt>${label}</dt><dd>${value}</dd></div>`;
    $('#hour-details').innerHTML=stat('Wind',quantity(row.wind,'speed',settings)+' · '+direction(row.dir))+stat('Gusts',quantity(row.gust,'speed',settings))+stat('Waves',quantity(row.wave,'height',settings)+' · '+direction(row.waveDir))+stat('Wave period',number(row.period)+' s')+stat('Swell',quantity(row.swell,'height',settings)+' · '+direction(row.swellDir))+stat('Swell period',number(row.swellPeriod)+' s')+stat('Rain chance',number(row.rain)+'%')+stat('Rainfall',quantity(row.precip,'rainfall',settings,settings.rainfall==='in'?2:1))+stat('Air',quantity(row.temp,'temperature',settings))+stat('Water',quantity(row.water,'temperature',settings))+stat('Visibility',quantity(finite(row.visibility)?row.visibility/1000:null,'distance',settings))+stat('Pressure',quantity(row.pressure,'pressure',settings))+stat('Current',quantity(row.current,'speed',settings,1))+stat('Blend confidence',row.blend?confidenceLevel(row.blend.score):'Single model');
    $('#hour-dialog').showModal();
  });
  document.addEventListener('preferences-change',refresh);return {refresh};
}
