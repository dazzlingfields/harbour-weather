import {SPOTS,fetchForecast,searchLocations} from './api.js';
import {read,write,cachedForecast,cacheForecast,locationKey} from './storage.js';
import {finite,number,direction,clock,dateKey,weather,assess,tripWindows,moonPhase,NZ_ZONE} from './forecast.js';
import {loadTides,renderTides} from './tides.js';
import {openMap} from './map.js';
const $=s=>document.querySelector(s);
const paths={
  map:'m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Zm6-2v16m6-14v16',
  wind:'M3 8h12a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h5a3 3 0 1 1-3 3',
  waves:'M2 8c3-4 5 4 8 0s5 4 8 0 4 0 4 0M2 13c3-4 5 4 8 0s5 4 8 0 4 0 4 0M2 18c3-4 5 4 8 0s5 4 8 0 4 0 4 0',
  thermometer:'M9 14V5a3 3 0 0 1 6 0v9a5 5 0 1 1-6 0M12 8v10M18 5h3m-3 4h2',
  sun:'M12 3v1m0 16v1M3 12h1m16 0h1M5.6 5.6l.7.7m11.4 11.4.7.7M5.6 18.4l.7-.7M17.7 6.3l.7-.7M16.5 12a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0',
  partly:'M8 2v2M2 9h2M3 4l1.5 1.5M13 4l-1 1M5 12a5 5 0 1 1 8-6M7 20a4 4 0 0 1-1-7.9 6 6 0 0 1 11.6-1.6A4.7 4.7 0 1 1 18 20Z',
  cloud:'M6 19a4.5 4.5 0 0 1-.8-8.9 6 6 0 0 1 11.6-1.6A5.3 5.3 0 1 1 18 19Z',
  rain:'M6 16a4 4 0 0 1-1-7.9 6 6 0 0 1 11.6-1.6A4.7 4.7 0 1 1 18 16M8 19l-1 3m6-3-1 3m6-3-1 3',
  storm:'M6 16a4 4 0 0 1-1-7.9 6 6 0 0 1 11.6-1.6A4.7 4.7 0 1 1 18 16M13 13l-4 6h5l-3 4',
  fog:'M6 13a4 4 0 0 1-1-7.9 6 6 0 0 1 11.6-1.6A4.7 4.7 0 1 1 18 13M3 17h18M5 21h14',
  sunrise:'M2 19h20M5 16a7 7 0 0 1 14 0M12 2v4M3 7l3 3m15-3-3 3M12 14V8m-3 3 3-3 3 3',
  settings:'M10 3h4l1 3 3 1 2-1 2 4-2 2v3l2 2-2 4-3-1-3 1-1 3h-4l-1-3-3-1-2 1-2-4 2-2v-3l-2-2 2-4 3 1 3-1ZM15 13a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  bookmark:'M6 3h12v18l-6-4-6 4Z',refresh:'M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5M4 16a8 8 0 0 0 14 3l3-3m0 5v-5h-5',
  chevron:'m6 9 6 6 6-6',shield:'M12 3 3 6v6c0 5 9 9 9 9s9-4 9-9V6ZM12 8v5m0 3v.2',
  compass:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM16 8l-3 5-5 3 3-5Z',
  calendar:'M4 5h16v16H4ZM4 10h16M8 3v4m8-4v4M8 14h2m4 0h2m-8 4h2',
  fish:'M4 12c5-8 10-8 16 0-6 8-11 8-16 0Zm0 0-3-4v8Zm8-5 2-3 3 4m-5 9 2 3 3-4M16 11v.1',
  close:'m6 6 12 12M6 18 18 6',search:'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0Zm-1 5 6 6'
};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]||paths.cloud}"/></svg>`;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
document.querySelectorAll('[data-icon]').forEach(e=>e.innerHTML=icon(e.dataset.icon));
const initialSettings=read('settings',{});
const state={spot:read('spot',SPOTS[0]),favorites:read('favorites',[]),settings:{unit:initialSettings.unit||'kn',wind:initialSettings.wind||15,gust:initialSettings.gust||22,wave:initialSettings.wave||1},data:null,range:24,day:null,controller:null,loading:false,offline:false,error:null,view:'overview'};
const speed=n=>number(finite(n)?n*({kn:1,kmh:1.852,ms:0.514444}[state.settings.unit]||1):null);
const unit=()=>({kn:'kn',kmh:'km/h',ms:'m/s'}[state.settings.unit]||'kn');
const dayLabel=ts=>new Intl.DateTimeFormat('en-NZ',{timeZone:NZ_ZONE,weekday:'short',day:'numeric',month:'short'}).format(new Date(ts*1000));
const arrow=n=>finite(n)?`<span class="direction-arrow" style="transform:rotate(${n+180}deg)" aria-hidden="true">↑</span>`:'';
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('visible'),3500);}
function saved() {return state.favorites.some(s=>locationKey(s)===locationKey(state.spot));}
function renderSpot(){
  $('#spot-name').textContent=state.spot.name;$('#spot-area').textContent=state.spot.area;
  document.title=`${state.spot.name} · Harbour`;
  $('#save-label').textContent=saved()?'Saved':'Save spot';$('#favourite-button').setAttribute('aria-pressed',String(saved()));
  $('#favourite-button').style.background=saved()?'#e5efdf':'';
  $('#saved-spots').innerHTML=state.favorites.map((s,i)=>`<button class="spot-chip" data-favorite="${i}">${esc(s.name)}</button>`).join('');
}
function renderStatus(){
  const e=$('#data-status');e.className='data-status';
  if(state.loading){e.textContent=state.data?'Refreshing forecast…':'Loading weather and marine forecast…';return;}
  if(!state.data){e.classList.add('error');e.textContent=state.error||'Forecast unavailable. Try Refresh.';return;}
  const age=Date.now()-state.data.fetchedAt,stale=age>6*3600*1000;
  if(state.offline||stale||state.error)e.classList.add('stale');
  const stamp=new Intl.DateTimeFormat('en-NZ',{timeZone:NZ_ZONE,day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(new Date(state.data.fetchedAt));
  const prefix=state.offline?'Offline · saved forecast':state.error?'Refresh failed · saved forecast':stale?'Stale · downloaded forecast':'Downloaded forecast';
  e.innerHTML=`<span class="status-dot"></span>${prefix} ${esc(stamp)} NZ time${state.data.marineAvailable?'':' · Marine data unavailable'}`;
}
function current(){return state.data?.rows.find(r=>r.ts<=Date.now()/1000&&r.ts+3600>Date.now()/1000)||null;}
function metric(label,value,suffix,note,kind){return `<article class="metric"><div class="metric-top"><span class="metric-label">${label}</span>${icon(kind)}</div><strong>${value} <small>${suffix}</small></strong><p>${note}</p></article>`;}
function renderCurrent(){
  const r=current()||{},w=weather(r.code),rating=assess(r,state.settings);
  $('#current-time').textContent=finite(r.ts)?`${clock(r.ts)} · model hour`:'Current hour unavailable';
  $('#conditions-main').innerHTML=`<span class="hero-weather">${icon(w.icon)}</span><div><div class="hero-number">${number(r.temp)}<span>°</span></div><p>${w.label}</p></div>`;
  const old=state.offline||state.error||state.data&&Date.now()-state.data.fetchedAt>6*3600*1000;
  $('#condition-rating').className='condition-rating '+(old?'unknown':rating.kind);
  $('#condition-rating').textContent=old?'Saved forecast · check latest conditions':rating.label;
  $('#condition-summary').textContent=finite(r.wind)&&finite(r.wave)?`${direction(r.dir)} wind ${speed(r.wind)} ${unit()}, gusting ${speed(r.gust)}. Waves ${number(r.wave,1)} m at ${number(r.period)} seconds.`:state.data?'Some conditions are unavailable for this hour.':'Choose a location or refresh to load conditions.';
  $('#current-date').textContent=finite(r.ts)?dayLabel(r.ts):'—';
  $('#metrics').innerHTML=metric('Wind',speed(r.wind),unit(),`${direction(r.dir)} · gusts ${speed(r.gust)} ${unit()}`,'wind')+metric('Waves',number(r.wave,1),'m',`${direction(r.waveDir)} · ${number(r.period)} s period`,'waves')+metric('Swell',number(r.swell,1),'m',`${direction(r.swellDir)} · ${number(r.swellPeriod)} s period`,'waves')+metric('Sea temperature',number(r.water,1),'°C','Modelled surface temperature','thermometer');
}
function forecastTable(rows){
  if(!rows.length)return '<p class="empty-state">No forecast hours available for this period. Refresh to get the latest forecast.</p>';
  const cells=(fn,klass='')=>rows.map(r=>`<td${klass?` class="${klass}"`:''}>${fn(r)}</td>`).join('');
  const heat=(n,limit)=>!finite(n)?'':n>limit?'heat-high':n>limit*.7?'heat-mid':'heat-low';
  return `<table class="forecast-table"><thead><tr><th scope="col">NZ local time</th>${rows.map((r,i)=>`<th scope="col"${i===0?' class="now-col"':''}><small>${esc(dayLabel(r.ts).split(',')[0])}</small>${esc(clock(r.ts))}${icon(weather(r.code).icon)}<span class="sr-only">${weather(r.code).label}</span></th>`).join('')}</tr></thead><tbody>
  <tr><th scope="row">Wind (${unit()})</th>${rows.map(r=>`<td class="${heat(r.wind,state.settings.wind)}">${speed(r.wind)}</td>`).join('')}</tr>
  <tr><th scope="row">Gusts (${unit()})</th>${rows.map(r=>`<td class="${heat(r.gust,state.settings.gust)}">${speed(r.gust)}</td>`).join('')}</tr>
  <tr><th scope="row">Wind from</th>${cells(r=>arrow(r.dir)+direction(r.dir))}</tr>
  <tr class="row-waves"><th scope="row">Waves (m)</th>${cells(r=>number(r.wave,1))}</tr>
  <tr><th scope="row">Wave period (s)</th>${cells(r=>number(r.period))}</tr>
  <tr><th scope="row">Waves from</th>${cells(r=>arrow(r.waveDir)+direction(r.waveDir))}</tr>
  <tr><th scope="row">Swell (m / s)</th>${cells(r=>`${number(r.swell,1)} / ${number(r.swellPeriod)}`)}</tr>
  <tr><th scope="row">Swell from</th>${cells(r=>direction(r.swellDir))}</tr>
  <tr><th scope="row">Air (°C)</th>${cells(r=>number(r.temp))}</tr>
  <tr><th scope="row">Rain chance</th>${cells(r=>number(r.rain)+'%')}</tr>
  <tr><th scope="row">Rain (mm)</th>${cells(r=>number(r.precip,1))}</tr>
  <tr><th scope="row">Visibility (km)</th>${cells(r=>number(finite(r.visibility)?r.visibility/1000:null,1))}</tr>
  <tr><th scope="row">Pressure (hPa)</th>${cells(r=>number(r.pressure))}</tr></tbody></table>`;
}
function renderHourly(){const start=Math.floor(Date.now()/3600000)*3600;$('#hourly-content').innerHTML=forecastTable((state.data?.rows||[]).filter(r=>r.ts>=start).slice(0,state.range));}
function renderWindows(){
  const s=state.settings;$('#limits-note').textContent=`Next 72h · wind ≤ ${s.wind} kn · gusts ≤ ${s.gust} kn · waves ≤ ${s.wave} m`;
  const stale=state.data&&Date.now()-state.data.fetchedAt>6*3600*1000;
  if(!state.data||state.offline||state.error||stale){$('#trip-windows').innerHTML='<p class="empty-state">Refresh online to calculate trip windows from a current forecast.</p>';return;}
  const windows=tripWindows(state.data.rows,state.data.daily,state.settings);
  $('#trip-windows').innerHTML=windows.length?windows.map(w=>`<div class="window"><span class="window-dot" aria-hidden="true">↗</span><div class="window-time">${esc(dayLabel(w.start))} · ${esc(clock(w.start))}–${esc(clock(w.end))}<small>Wind up to ${speed(w.wind)} ${unit()} · waves up to ${number(w.wave,1)} m</small></div><span class="window-duration">${w.hours} hours</span></div>`).join(''):'<p class="empty-state">No complete daylight periods of 2+ hours meet all your limits in the next 72 hours. Missing data is never treated as a calm forecast.</p>';
}
function todayIndex(){return state.data?.daily?.time.findIndex(t=>dateKey(t)===dateKey(Date.now()/1000))??-1;}
function renderSun(){const d=state.data?.daily,i=todayIndex(),r=current()||{};$('#daylight-content').innerHTML=`<div><span>Sunrise</span><strong>${clock(d?.sunrise?.[i])}</strong></div><div><span>Sunset</span><strong>${clock(d?.sunset?.[i])}</strong></div>`;$('#extra-content').innerHTML=`<div><span>UV max today</span><b>${number(d?.uv_index_max?.[i],1)}</b></div><div><span>Rain chance</span><b>${number(r.rain)}%</b></div><div><span>Visibility</span><b>${number(finite(r.visibility)?r.visibility/1000:null,1)} km</b></div><div><span>Pressure</span><b>${number(r.pressure)} hPa</b></div>`;}
function max(rows,k){const a=rows.map(r=>r[k]).filter(finite);return a.length?Math.max(...a):null;}
function renderDays(){
  const d=state.data?.daily;
  if(!d?.time){$('#daily-content').innerHTML='<p class="empty-state">A forecast is needed for the seven-day outlook.</p>';$('#day-detail').innerHTML=forecastTable([]);return;}
  if(!d.time.includes(state.day))state.day=d.time[0];
  $('#daily-content').innerHTML=d.time.map((ts,i)=>{const rows=state.data.rows.filter(r=>dateKey(r.ts)===dateKey(ts));const noon=rows.find(r=>new Intl.DateTimeFormat('en-GB',{timeZone:NZ_ZONE,hour:'2-digit',hour12:false}).format(new Date(r.ts*1000))==='12')||rows[0]||{};return `<button class="day-card ${state.day===ts?'selected':''}" data-day="${ts}" aria-pressed="${state.day===ts}"><span class="day-name">${i===0?'Today':new Intl.DateTimeFormat('en-NZ',{timeZone:NZ_ZONE,weekday:'long'}).format(new Date(ts*1000))}</span><span class="day-date">${esc(new Intl.DateTimeFormat('en-NZ',{timeZone:NZ_ZONE,day:'numeric',month:'short'}).format(new Date(ts*1000)))}</span>${icon(weather(noon.code).icon)}<span class="sr-only">${weather(noon.code).label}</span><div class="day-temp">${number(d.temperature_2m_max?.[i])}° <span class="section-note">/ ${number(d.temperature_2m_min?.[i])}°</span></div><span class="day-stat">Wind <b>${speed(max(rows,'wind'))}</b> ${unit()}</span><span class="day-stat">Gusts <b>${speed(max(rows,'gust'))}</b> ${unit()}</span><span class="day-stat">Waves <b>${number(max(rows,'wave'),1)}</b> m</span></button>`;}).join('');
  $('#day-detail-heading').textContent=dayLabel(state.day);$('#day-detail').innerHTML=forecastTable(state.data.rows.filter(r=>dateKey(r.ts)===dateKey(state.day)));
}
function renderFishing(){const r=current()||{},d=state.data?.daily,i=todayIndex(),moon=moonPhase(Date.now()/1000);const fact=(name,val)=>`<div class="fact"><span>${name}</span><strong>${val}</strong></div>`;$('#fishing-content').innerHTML=fact('Water temperature',`${number(r.water,1)} °C`)+fact('Sunrise / sunset',`${clock(d?.sunrise?.[i])} / ${clock(d?.sunset?.[i])}`)+fact('Moon phase',`${moon.label}<small>Approx. ${moon.illumination}% illuminated</small>`)+fact('Offshore model current',`${finite(r.current)?r.current.toFixed(1):'—'} kn · towards ${direction(r.currentDir)}<small>Not a channel or bar tidal stream forecast</small>`)+fact('Sea-level pressure',`${number(r.pressure)} hPa`);}
function render(){renderSpot();renderStatus();renderCurrent();renderHourly();renderWindows();renderSun();renderDays();renderFishing();$('#location-date').textContent=new Intl.DateTimeFormat('en-NZ',{timeZone:NZ_ZONE,weekday:'long',day:'numeric',month:'long'}).format(new Date());if(state.data?.grid)$('#grid-info').textContent=`Marine model grid: ${state.data.grid.lat.toFixed(3)}, ${state.data.grid.lon.toFixed(3)}. Selected spot: ${state.spot.lat.toFixed(3)}, ${state.spot.lon.toFixed(3)}. These can differ by several kilometres.`;}
async function load(spot=state.spot){
  state.controller?.abort();const controller=new AbortController();state.controller=controller;
  state.spot=spot;write('spot',spot);state.data=cachedForecast(spot);state.offline=!navigator.onLine;state.error=null;state.loading=true;state.day=null;render();loadTides(spot);if(state.view==='map')view('map');$('#refresh-button').disabled=true;
  const timeout=setTimeout(()=>controller.abort(),25000);
  try{const data=await fetchForecast(spot,controller.signal);if(state.controller!==controller)return;state.data=data;state.offline=false;if(!cacheForecast(spot,data))toast('Forecast loaded. Device storage is full or unavailable.');}
  catch(e){if(state.controller!==controller)return;state.offline=!navigator.onLine;state.error=e.name==='AbortError'?'Forecast request timed out. Try Refresh.':e.message;}
  finally{clearTimeout(timeout);if(state.controller===controller){state.loading=false;$('#refresh-button').disabled=false;render();}}
}
function view(name){state.view=name;document.body.classList.toggle('map-mode',name==='map');document.querySelectorAll('.view').forEach(e=>e.hidden=e.id!==`view-${name}`);document.querySelectorAll('[data-view]').forEach(e=>{const active=e.dataset.view===name;e.classList.toggle('active',active);if(active)e.setAttribute('aria-current','page');else e.removeAttribute('aria-current');});if(name==='map')openMap(state.spot,spot=>{view('overview');load(spot);},toast);}
document.querySelectorAll('[data-view]').forEach(e=>e.addEventListener('click',()=>view(e.dataset.view)));
document.querySelectorAll('.close-dialog').forEach(e=>e.addEventListener('click',()=>e.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}));
$('#refresh-button').addEventListener('click',()=>load());
$('#favourite-button').addEventListener('click',()=>{state.favorites=saved()?state.favorites.filter(s=>locationKey(s)!==locationKey(state.spot)):[...state.favorites,state.spot];if(!write('favorites',state.favorites))toast('Device storage unavailable. Spot saved for this session.');else toast(saved()?'Spot saved on this device':'Spot removed');renderSpot();});
$('#saved-spots').addEventListener('click',e=>{const b=e.target.closest('[data-favorite]');if(b)load(state.favorites[Number(b.dataset.favorite)]);});
document.querySelectorAll('[data-range]').forEach(e=>e.addEventListener('click',()=>{state.range=Number(e.dataset.range);document.querySelectorAll('[data-range]').forEach(b=>{b.classList.toggle('selected',b===e);b.setAttribute('aria-pressed',String(b===e));});renderHourly();}));
$('#daily-content').addEventListener('click',e=>{const b=e.target.closest('[data-day]');if(b){state.day=Number(b.dataset.day);renderDays();}});
function openSettings(){const f=$('#settings-form');Object.entries(state.settings).forEach(([k,v])=>{if(f.elements[k])f.elements[k].value=v;});$('#settings-dialog').showModal();}
$('#settings-button').addEventListener('click',openSettings);$('#edit-limits').addEventListener('click',openSettings);
$('#settings-form').addEventListener('submit',e=>{e.preventDefault();const f=e.target;state.settings={unit:f.elements.unit.value,wind:Number(f.elements.wind.value),gust:Number(f.elements.gust.value),wave:Number(f.elements.wave.value)};const persisted=write('settings',state.settings);$('#settings-dialog').close();render();toast(persisted?'Preferences saved':'Preferences applied for this session only');});
$('#about-button').addEventListener('click',()=>$('#about-dialog').showModal());
$('#select-on-map').addEventListener('click',()=>{$('#location-dialog').close();view('map');});
$('[data-open-tides]').addEventListener('click',()=>view('fishing'));
let results=SPOTS,searchController=null;
function showResults(spots){results=spots;$('#location-results').innerHTML=spots.map((s,i)=>`<button class="location-option" data-result="${i}"><span><strong>${esc(s.name)}</strong><small>${esc(s.area)} · ${s.lat.toFixed(2)}, ${s.lon.toFixed(2)}</small></span><span aria-hidden="true">↗</span></button>`).join('');}
$('#location-button').addEventListener('click',()=>{$('#location-search').value='';$('#search-status').textContent='Popular coastal spots';showResults(SPOTS);$('#location-dialog').showModal();});
$('#location-results').addEventListener('click',e=>{const b=e.target.closest('[data-result]');if(b){searchController?.abort();$('#location-dialog').close();load(results[Number(b.dataset.result)]);}});
$('#search-form').addEventListener('submit',async e=>{
  e.preventDefault();const q=$('#location-search').value.trim();searchController?.abort();searchController=new AbortController();const controller=searchController;
  if(q.length<2){showResults(SPOTS);$('#search-status').textContent='Popular coastal spots';return;}
  const coords=q.replaceAll('−','-').match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if(coords){const lat=Number(coords[1]),lon=Number(coords[2]);if(lat< -48||lat> -33||lon<165||lon>180){$('#search-status').textContent='This baseline covers mainland New Zealand waters (33–48°S, 165–180°E).';showResults([]);return;}showResults([{name:'Custom coastal spot',area:'New Zealand',lat,lon}]);$('#search-status').textContent='Choose this coordinate';return;}
  const local=SPOTS.filter(s=>(s.name+' '+s.area).toLowerCase().includes(q.toLowerCase()));showResults(local);$('#search-status').textContent='Searching New Zealand…';
  try{const remote=await searchLocations(q,controller.signal);if(controller!==searchController)return;const keys=new Set(local.map(locationKey));showResults([...local,...remote.filter(r=>!keys.has(locationKey(r)))]);$('#search-status').textContent=results.length?'Select a spot · towns use a nearby sea model cell':'No locations found. Try a nearby town or coordinates.';}
  catch(e){if(e.name!=='AbortError')$('#search-status').textContent=local.length?'Showing matching coastal spots. Online search unavailable.':'Search unavailable. Try a popular spot or coordinates.';}
});
let installPrompt=null;window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('#install-button').hidden=false;});
$('#install-button').addEventListener('click',async()=>{if(!installPrompt)return;await installPrompt.prompt();installPrompt=null;$('#install-button').hidden=true;});
window.addEventListener('online',()=>load());window.addEventListener('offline',()=>{state.offline=true;renderStatus();renderCurrent();renderWindows();});
setInterval(()=>{if(!state.loading){renderStatus();renderCurrent();renderHourly();renderWindows();renderSun();renderTides();}},60000);
if('serviceWorker' in navigator&&!window.Capacitor?.isNativePlatform?.())navigator.serviceWorker.register('./sw.js').catch(()=>{});
load();
