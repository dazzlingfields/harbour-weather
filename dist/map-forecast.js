import {fetchForecast} from './api.js';
import {read,cachedForecast,cacheForecast} from './storage.js';
import {dateKey,clock,number,direction,weather,finite,NZ_ZONE} from './forecast.js';
import {nearestStation,distanceKm} from './geo.js';
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let spot,data,tides,day,request=0,controller,timer,loading=false,error='',tideError=false;
const max=(rows,key)=>{const v=rows.map(r=>r[key]).filter(finite);return v.length?Math.max(...v):null;};
const speed=n=>number(finite(n)?n*(read('settings',{}).unit==='kmh'?1.852:1):null);
const unit=()=>read('settings',{}).unit==='kmh'?'km/h':'kn';
const dayLabel=key=>new Intl.DateTimeFormat('en-NZ',{timeZone:'UTC',weekday:'short',day:'numeric'}).format(new Date(key+'T12:00:00Z'));
function render(){
  $('#map-weather-title').textContent=spot.name;
  $('#map-weather-coordinates').textContent=`${spot.lat.toFixed(4)}, ${spot.lon.toFixed(4)}`;
  $('#map-weather-state').textContent=loading?'Updating forecast…':error||(data?.marineAvailable?'':'Marine forecast unavailable');
  const stale=data&&Date.now()-data.fetchedAt>6*3600000;
  $('#map-weather-source').innerHTML=`<a href="https://open-meteo.com/en/docs" target="_blank" rel="noopener">Open-Meteo</a> · ${data?`${stale?'Saved · ':''}downloaded ${new Intl.DateTimeFormat('en-NZ',{timeZone:NZ_ZONE,day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(data.fetchedAt)}`:'Model forecast'} · NZ time`;
  if(!data){$('#map-weather-days').innerHTML='';$('#map-weather-detail').textContent='Wind, waves and tides will appear here.';return;}
  const today=dateKey(Date.now()/1000),keys=[...new Set(data.rows.map(r=>dateKey(r.ts)))].filter(k=>k>=today).slice(0,7);
  if(!keys.includes(day))day=keys[0];
  $('#map-weather-days').innerHTML=keys.map(key=>{const rows=data.rows.filter(r=>dateKey(r.ts)===key),mid=rows[Math.floor(rows.length/2)];return `<button class="map-day${key===day?' selected':''}" data-map-day="${key}" aria-pressed="${key===day}"><strong>${esc(dayLabel(key))}</strong><small>${esc(weather(mid?.code).label)}</small><span><b>${speed(max(rows,'wind'))}</b> ${unit()} <small>wind max</small></span><span><b>${number(max(rows,'wave'),1)}</b> m <small>waves max</small></span><small>Gust ${speed(max(rows,'gust'))} ${unit()}</small></button>`;}).join('');
  renderDetail();
}
function renderDetail(){
  const now=Date.now()/1000,rows=data.rows.filter(r=>dateKey(r.ts)===day),r=day===dateKey(now)?rows.find(r=>r.ts>=now)||rows.at(-1):rows[Math.floor(rows.length/2)];
  if(!r){$('#map-weather-detail').textContent='Forecast unavailable for this day.';return;}
  const events=tides?.events.filter(e=>dateKey(e[0])===day)||[];
  const tideText=tides?`LINZ ${esc(tides.station.name)} port (${Math.round(distanceKm(spot,tides.station))} km): ${events.length?events.map(e=>`${e[2]==='H'?'High':'Low'} ${clock(e[0])} ${number(e[1],1)} m`).join(' · '):'No table for this date'}`:tideError?'Nearby tide table unavailable · check LINZ':'Loading nearby port tides…';
  $('#map-weather-detail').innerHTML=`<span><b>${esc(dayLabel(day))} · ${clock(r.ts)}</b> · ${direction(r.dir)} ${speed(r.wind)} ${unit()} · gust ${speed(r.gust)} · waves ${number(r.wave,1)} m / ${number(r.period)} s · swell ${number(r.swell,1)} m · rain ${number(r.rain)}%</span><span class="map-tide-line">${tideText}</span>`;
}
async function loadPort(p,id){
  try{const index=await fetch('./data/tides-index.json').then(r=>r.json());const station=nearestStation(p,index.stations);const year=Number(dateKey(Date.now()/1000).slice(0,4));const files=[year,year+1].filter(y=>station.files[y]);const tables=await Promise.all(files.map(y=>fetch('./data/'+station.files[y]).then(r=>{if(!r.ok)throw Error();return r.json();})));if(id!==request)return;tides={station,events:tables.flatMap(t=>t.events).sort((a,b)=>a[0]-b[0])};if(data)renderDetail();}
  catch{if(id===request){tides=null;tideError=true;if(data)renderDetail();}}
}
export function initMapForecast(save,full){
  $('#map-weather-save').addEventListener('click',save);
  $('#map-weather-full').addEventListener('click',()=>spot&&full(spot));
  $('#map-weather-close').addEventListener('click',()=>{$('#map-weather').hidden=true;});
  $('#map-weather-collapse').addEventListener('click',e=>{const collapsed=$('#map-weather').classList.toggle('collapsed');e.currentTarget.setAttribute('aria-expanded',String(!collapsed));e.currentTarget.textContent=collapsed?'Expand':'Minimise';});
  $('#map-weather-days').addEventListener('click',e=>{const b=e.target.closest('[data-map-day]');if(!b)return;day=b.dataset.mapDay;$('#map-weather-days').querySelectorAll('button').forEach(el=>{el.classList.toggle('selected',el===b);el.setAttribute('aria-pressed',String(el===b));});renderDetail();});
}
export function showMapForecast(p){
  spot=p;const id=++request;controller?.abort();clearTimeout(timer);data=cachedForecast(p);tides=null;tideError=false;day=null;loading=true;error='';$('#map-weather').hidden=false;render();$('#map-weather-days').scrollLeft=0;loadPort(p,id);
  timer=setTimeout(async()=>{const abort=new AbortController();controller=abort;const timeout=setTimeout(()=>abort.abort(),25000);
    try{const fresh=await fetchForecast(p,abort.signal);if(id!==request)return;data=fresh;cacheForecast(p,fresh);}
    catch(e){if(id!==request)return;error=data?'Offline or unavailable · saved forecast shown':e.name==='AbortError'?'Forecast timed out · tap again to retry':e.message;}
    finally{clearTimeout(timeout);if(id===request){loading=false;render();}}
  },350);
}
