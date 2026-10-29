import {fetchForecast} from './api.js';
import {read,write,cachedForecast,cacheForecast,modelSelection,locationKey} from './storage.js';
import {modelKey} from './models.js';
import {dateKey,clock,number,NZ_ZONE} from './forecast.js';
import {nearestStation,distanceKm} from './geo.js';
import {hourlyTable,forecastHours,dateGroups,dateLabel,speedValue,speedUnit,escapeHTML as esc} from './hourly.js';
import {icon} from './icons.js';
import {quantity} from './units.js';
const $=s=>document.querySelector(s);
let spot,data,tides,models=modelSelection(),rows=[],request=0,controller,timer,loading=false,error='',tideError=false,selectedHour=null,scrollFrame,pendingScroll=null;
let range=read('map-forecast-range',72)===168?168:72,more=read('map-forecast-more',false)===true;
function render(){
  const scroll=$('#map-hourly-scroll'),left=pendingScroll??scroll.scrollLeft,top=scroll.scrollTop;
  $('#map-weather-title').textContent=spot.name;$('#map-weather-title').title=spot.name;
  document.dispatchEvent(new CustomEvent('forecast-provenance',{detail:data}));
  $('#map-weather-coordinates').textContent=`${spot.lat.toFixed(4)}, ${spot.lon.toFixed(4)}`;
  $('#map-weather-state').textContent=loading?(data?'Updating…':'Loading forecast…'):error||(data&&!data.marineAvailable?'Wave model unavailable · wind still shown':'');
  const stale=data&&Date.now()-data.fetchedAt>6*3600000;
  $('#map-weather-source').innerHTML=`<a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a>${data?` · ${stale?'saved ':''}${new Intl.DateTimeFormat('en-NZ',{timeZone:NZ_ZONE,day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(data.fetchedAt)}`:''}`;
  document.querySelectorAll('[data-map-range]').forEach(b=>{const active=Number(b.dataset.mapRange)===range;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});
  $('#map-weather-more').setAttribute('aria-pressed',String(more));$('#map-weather-more').textContent=more?'Less':'More';
  rows=forecastHours(data?.rows||[],range);
  if(rows.length&&!rows.some(r=>r.ts===selectedHour))selectedHour=rows[0].ts;
  const peek=rows.find(r=>r.ts===selectedHour);$('#map-weather-peek').textContent=peek?`Wind ${speedValue(peek.wind,read('settings',{}).unit)} ${speedUnit(read('settings',{}).unit)} · waves ${quantity(peek.wave,'height',read('settings',{}))}`:loading?'Loading forecast…':'Tap to open forecast';
  $('#map-weather-hours').innerHTML=rows.length?hourlyTable(rows,{settings:read('settings',{}),more,selected:selectedHour,interactive:true}):`<p class="empty-state">${loading?'Loading hourly wind and waves…':'No current forecast hours. Refresh to retry.'}</p>`;
  $('#map-weather-dates').innerHTML=dateGroups(rows).map(g=>`<button data-map-date="${g.index}" aria-pressed="${dateKey(g.ts)===dateKey(selectedHour||Date.now()/1000)}">${esc(dateLabel(g.ts))}</button>`).join('');
  scroll.scrollLeft=left;scroll.scrollTop=top;if(rows.length)pendingScroll=null;renderTide();document.dispatchEvent(new CustomEvent('forecast-hour-change',{detail:rows.find(r=>r.ts===selectedHour)}));
}
function renderTide(){
  const day=dateKey(selectedHour||Date.now()/1000),events=tides?.byDay.get(day)||[];
  $('#map-weather-detail').innerHTML=tides?`<div class="map-tide-heading"><span>LINZ ${esc(tides.station.name)} · ${quantity(distanceKm(spot,tides.station),'distance',read('settings',{}))} · ${esc(dateLabel(selectedHour||Date.now()/1000))}</span><button class="text-button" data-map-tides>Port tides ↗</button></div><div class="map-tide-events">${events.length?events.map(e=>`<span><b>${e[2]==='H'?'High':'Low'}</b> ${clock(e[0])} · ${quantity(e[1],'height',read('settings',{}))}</span>`).join(''):'No published tide table for this day.'}</div>`:`<span class="map-tide-pending">${tideError?'Nearby tide table unavailable':'Loading nearby port tides…'}</span>`;
  $('#map-weather-dates').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(dateKey(rows[Number(b.dataset.mapDate)]?.ts||0)===day)));
}
function highlightHour(index){
  const r=rows[index];if(!r||r.ts===selectedHour)return;const previousDay=dateKey(selectedHour||r.ts);selectedHour=r.ts;document.dispatchEvent(new CustomEvent('forecast-hour-change',{detail:r}));
  $('#map-weather-peek').textContent=`Wind ${speedValue(r.wind,read('settings',{}).unit)} ${speedUnit(read('settings',{}).unit)} · waves ${quantity(r.wave,'height',read('settings',{}))}`;
  $('#map-weather-hours').querySelectorAll('.selected-hour').forEach(e=>e.classList.remove('selected-hour'));
  $('#map-weather-hours').querySelectorAll('.hourly-weather,tbody tr').forEach(tr=>tr.children[index+1]?.classList.add('selected-hour'));
  $('#map-weather-hours').querySelectorAll('[data-hour]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.hour)===selectedHour)));if(dateKey(selectedHour)!==previousDay)renderTide();
}
async function loadPort(p,id){
    try{const index=await fetch('./data/tides-index.json').then(r=>{if(!r.ok)throw Error();return r.json();});const station=nearestStation(p,index.stations);const year=Number(dateKey(Date.now()/1000).slice(0,4));const tables=await Promise.all([year,year+1].filter(y=>station.files[y]).map(y=>fetch('./data/'+station.files[y]).then(r=>{if(!r.ok)throw Error();return r.json();})));if(id!==request)return;const byDay=new Map();for(const event of tables.flatMap(t=>t.events).sort((a,b)=>a[0]-b[0])){const key=dateKey(event[0]);if(!byDay.has(key))byDay.set(key,[]);byDay.get(key).push(event);}tides={station,byDay};renderTide();}
  catch{if(id===request){tides=null;tideError=true;renderTide();}}
}
function setCollapsed(collapsed){$('#map-weather').classList.toggle('collapsed',collapsed);$('#map-weather-collapse').setAttribute('aria-expanded',String(!collapsed));$('#map-weather-heading-toggle').setAttribute('aria-expanded',String(!collapsed));$('#map-weather-collapse').setAttribute('aria-label',collapsed?'Show forecast':'Minimise forecast');}
export function initMapForecast(save,full){
  $('#map-weather-save').addEventListener('click',save);$('#map-weather-full').addEventListener('click',()=>spot&&full(spot));
  $('#map-weather-close').addEventListener('click',()=>{$('#map-weather').hidden=true;});
  $('#map-weather-collapse').addEventListener('click',()=>setCollapsed(!$('#map-weather').classList.contains('collapsed')));
  $('#map-weather-expand').addEventListener('click',()=>{setCollapsed(false);const expanded=$('#map-weather').classList.toggle('is-expanded');$('#map-weather-expand').setAttribute('aria-pressed',String(expanded));$('#map-weather-expand').setAttribute('aria-label',expanded?'Reduce forecast panel':'Expand forecast panel');});
  const title=$('#map-weather-title').parentElement;let dragStart;
  title.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setCollapsed(!$('#map-weather').classList.contains('collapsed'));}});
  title.addEventListener('pointerdown',e=>{dragStart=e.clientY;title.setPointerCapture(e.pointerId);});
  title.addEventListener('pointerup',e=>{if(dragStart===undefined)return;const delta=e.clientY-dragStart;dragStart=undefined;if(delta< -40){setCollapsed(false);if(!$('#map-weather').classList.contains('is-expanded'))$('#map-weather-expand').click();}else if(delta>40){if($('#map-weather').classList.contains('is-expanded'))$('#map-weather-expand').click();else setCollapsed(true);}else if(Math.abs(delta)<8)setCollapsed(!$('#map-weather').classList.contains('collapsed'));});
  document.querySelectorAll('[data-map-range]').forEach(b=>b.addEventListener('click',()=>{range=Number(b.dataset.mapRange);write('map-forecast-range',range);selectedHour=null;pendingScroll=0;render();}));
  $('#map-weather-more').addEventListener('click',()=>{more=!more;write('map-forecast-more',more);render();});
  $('#map-weather-refresh').addEventListener('click',()=>showMapForecast(spot,{preserve:true,force:true}));
  $('#forecast-key-open').addEventListener('click',()=>$('#forecast-key-dialog').showModal());
  $('#map-weather-hours').addEventListener('click',e=>{const b=e.target.closest('[data-hour]');if(b)highlightHour(rows.findIndex(r=>r.ts===Number(b.dataset.hour)));});
  $('#map-weather-dates').addEventListener('click',e=>{const b=e.target.closest('[data-map-date]');if(!b)return;const index=Number(b.dataset.mapDate),cell=$('.hourly-weather th[data-hour-col]');if(cell){$('#map-hourly-scroll').scrollTo({left:index*cell.getBoundingClientRect().width,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});highlightHour(index);}});
  $('#map-hourly-scroll').addEventListener('scroll',()=>{cancelAnimationFrame(scrollFrame);scrollFrame=requestAnimationFrame(()=>{const cell=$('#map-weather-hours .hourly-weather th[data-hour-col]');if(cell)highlightHour(Math.min(rows.length-1,Math.round($('#map-hourly-scroll').scrollLeft/cell.getBoundingClientRect().width)));});},{passive:true});
  $('#map-weather-detail').addEventListener('click',e=>{if(e.target.closest('[data-map-tides]'))document.dispatchEvent(new CustomEvent('open-map-tides'));});
  document.addEventListener('forecast-models-change',()=>{if(spot&&!$('#view-map').hidden)showMapForecast(spot,{preserve:true});});
  document.addEventListener('preferences-change',()=>{if(spot)render();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&spot&&!$('#view-map').hidden)showMapForecast(spot,{preserve:true});});
}
export function syncMapForecast(){if(!spot)return;if(modelKey(models)!==modelKey(modelSelection()))showMapForecast(spot,{preserve:true});else render();}
export function showMapForecast(p,{preserve=false,force=false}={}){
  if(!p)return;const same=spot&&locationKey(spot)===locationKey(p);if(preserve&&same)pendingScroll=$('#map-hourly-scroll').scrollLeft;spot=p;models=modelSelection();const id=++request;controller?.abort();clearTimeout(timer);data=cachedForecast(p,models);error='';
  if(!preserve||!same){tides=null;tideError=false;selectedHour=null;pendingScroll=0;$('#map-hourly-scroll').scrollLeft=0;$('#map-hourly-scroll').scrollTop=0;setCollapsed(true);$('#map-weather').classList.remove('is-expanded');$('#map-weather-expand').setAttribute('aria-pressed','false');$('#map-weather-expand').setAttribute('aria-label','Expand forecast panel');}
  loading=force||!data||Date.now()-data.fetchedAt>15*60000;$('#map-weather').hidden=false;render();if(!tides)loadPort(p,id);
  if(!loading)return;
  const selection={...models};timer=setTimeout(async()=>{const abort=new AbortController();controller=abort;const timeout=setTimeout(()=>abort.abort(),25000);
    try{const fresh=await fetchForecast(p,abort.signal,selection);if(id!==request)return;data=fresh;cacheForecast(p,fresh);}
    catch(e){if(id!==request)return;error=data?'Connection unavailable · saved forecast shown':e.name==='AbortError'?'Forecast timed out · tap refresh to retry':e.message;}
    finally{clearTimeout(timeout);if(id===request){loading=false;render();}}
  },300);
}
