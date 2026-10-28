import {SPOTS,fetchForecast,searchLocations} from './api.js';
import {read,write,cachedForecast,cacheForecast,locationKey} from './storage.js';
import {finite,number,direction,clock,dateKey,weather,assess,tripWindows,moonPhase,NZ_ZONE} from './forecast.js';
import {loadTides,renderTides} from './tides.js';
import {openMap} from './map.js';
const $=s=>document.querySelector(s);
import {icon} from './icons.js';
import {hourlyTable,intensity} from './hourly.js';
import {initModelControls} from './model-controls.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
document.querySelectorAll('[data-icon]').forEach(e=>e.innerHTML=icon(e.dataset.icon));
initModelControls();
const native=window.Capacitor?.isNativePlatform?.();document.body.classList.toggle('native-app',!!native);
if(native)$('#install-note').textContent='Harbour 0.3.0 · Android app';
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
function metric(label,value,suffix,note,kind,strength=null){return `<article class="metric"${strength!==null?` data-strength="${strength}"`:''}><div class="metric-top"><span class="metric-label">${label}</span>${icon(kind)}</div><strong>${value} <small>${suffix}</small></strong><p>${note}</p></article>`;}
function renderCurrent(){
  const r=current()||{},w=weather(r.code),rating=assess(r,state.settings);
  $('#current-time').textContent=finite(r.ts)?`${clock(r.ts)} · model hour`:'Current hour unavailable';
  $('#conditions-main').innerHTML=`<span class="hero-weather">${icon(r.isDay===0&&w.icon==='sun'?'moon':w.icon)}</span><div><div class="hero-number">${number(r.temp)}<span>°</span></div><p>${w.label}</p></div>`;
  const old=state.offline||state.error||state.data&&Date.now()-state.data.fetchedAt>6*3600*1000;
  $('#condition-rating').className='condition-rating '+(old?'unknown':rating.kind);
  $('#condition-rating').textContent=old?'Saved forecast · check latest conditions':rating.label;
  $('#condition-summary').textContent=finite(r.wind)&&finite(r.wave)?`${direction(r.dir)} wind ${speed(r.wind)} ${unit()}, gusting ${speed(r.gust)}. Waves ${number(r.wave,1)} m at ${number(r.period)} seconds.`:state.data?'Some conditions are unavailable for this hour.':'Choose a location or refresh to load conditions.';
  $('#current-date').textContent=finite(r.ts)?dayLabel(r.ts):'—';
  $('#metrics').innerHTML=metric('Wind',speed(r.wind),unit(),`${direction(r.dir)} · gusts ${speed(r.gust)} ${unit()}`,'wind',intensity(r.wind,'wind').replace('intensity-',''))+metric('Waves',number(r.wave,1),'m',`${direction(r.waveDir)} · ${number(r.period)} s period`,'waves',intensity(r.wave,'wave').replace('intensity-',''))+metric('Swell',number(r.swell,1),'m',`${direction(r.swellDir)} · ${number(r.swellPeriod)} s period`,'waves',intensity(r.swell,'wave').replace('intensity-',''))+metric('Sea temperature',number(r.water,1),'°C','Modelled surface temperature','thermometer');
}
function forecastTable(rows){return hourlyTable(rows,{unit:state.settings.unit,more:true});}
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
  $('#daily-content').innerHTML=d.time.slice(0,7).map((ts,i)=>{const rows=state.data.rows.filter(r=>dateKey(r.ts)===dateKey(ts));const noon=rows.find(r=>new Intl.DateTimeFormat('en-GB',{timeZone:NZ_ZONE,hour:'2-digit',hour12:false}).format(new Date(r.ts*1000))==='12')||rows[0]||{};return `<button class="day-card ${state.day===ts?'selected':''}" data-day="${ts}" aria-pressed="${state.day===ts}"><span class="day-name">${i===0?'Today':new Intl.DateTimeFormat('en-NZ',{timeZone:NZ_ZONE,weekday:'long'}).format(new Date(ts*1000))}</span><span class="day-date">${esc(new Intl.DateTimeFormat('en-NZ',{timeZone:NZ_ZONE,day:'numeric',month:'short'}).format(new Date(ts*1000)))}</span>${icon(weather(noon.code).icon)}<span class="sr-only">${weather(noon.code).label}</span><div class="day-temp">${number(d.temperature_2m_max?.[i])}° <span class="section-note">/ ${number(d.temperature_2m_min?.[i])}°</span></div><span class="day-stat">Wind <b>${speed(max(rows,'wind'))}</b> ${unit()}</span><span class="day-stat">Gusts <b>${speed(max(rows,'gust'))}</b> ${unit()}</span><span class="day-stat">Waves <b>${number(max(rows,'wave'),1)}</b> m</span></button>`;}).join('');
  $('#day-detail-heading').textContent=dayLabel(state.day);$('#day-detail').innerHTML=forecastTable(state.data.rows.filter(r=>dateKey(r.ts)===dateKey(state.day)));
}
function renderFishing(){const r=current()||{},d=state.data?.daily,i=todayIndex(),moon=moonPhase(Date.now()/1000);const fact=(name,val)=>`<div class="fact"><span>${name}</span><strong>${val}</strong></div>`;$('#fishing-content').innerHTML=fact('Water temperature',`${number(r.water,1)} °C`)+fact('Sunrise / sunset',`${clock(d?.sunrise?.[i])} / ${clock(d?.sunset?.[i])}`)+fact('Moon phase',`${moon.label}<small>Approx. ${moon.illumination}% illuminated</small>`)+fact('Offshore model current',`${finite(r.current)?r.current.toFixed(1):'—'} kn · towards ${direction(r.currentDir)}<small>Not a channel or bar tidal stream forecast</small>`)+fact('Sea-level pressure',`${number(r.pressure)} hPa`);}
function render(){renderSpot();renderStatus();renderCurrent();renderHourly();renderWindows();renderSun();renderDays();renderFishing();$('#location-date').textContent=new Intl.DateTimeFormat('en-NZ',{timeZone:NZ_ZONE,weekday:'long',day:'numeric',month:'long'}).format(new Date());if(state.data?.grid)$('#grid-info').textContent=`Marine model grid: ${state.data.grid.lat.toFixed(3)}, ${state.data.grid.lon.toFixed(3)}. Selected spot: ${state.spot.lat.toFixed(3)}, ${state.spot.lon.toFixed(3)}. These can differ by several kilometres.`;}
async function load(spot=state.spot,{force=false}={}){
  state.controller?.abort();const controller=new AbortController();state.controller=controller;
  state.spot=spot;write('spot',spot);state.data=cachedForecast(spot);state.offline=!navigator.onLine;state.error=null;state.loading=true;state.day=null;render();loadTides(spot);if(state.view==='map')view('map');$('#refresh-button').disabled=true;
  if(!force&&state.data&&Date.now()-state.data.fetchedAt<15*60000){state.loading=false;$('#refresh-button').disabled=false;render();document.dispatchEvent(new CustomEvent('forecast-provenance',{detail:state.data}));return;}
  const timeout=setTimeout(()=>controller.abort(),25000);
  try{const data=await fetchForecast(spot,controller.signal);if(state.controller!==controller)return;state.data=data;state.offline=false;document.dispatchEvent(new CustomEvent('forecast-provenance',{detail:data}));if(!cacheForecast(spot,data))toast('Forecast loaded. Device storage is full or unavailable.');}
  catch(e){if(state.controller!==controller)return;state.offline=!navigator.onLine;state.error=e.name==='AbortError'?'Forecast request timed out. Try Refresh.':e.message;}
  finally{clearTimeout(timeout);if(state.controller===controller){state.loading=false;$('#refresh-button').disabled=false;render();}}
}
function view(name){const previous=state.view;state.view=name;document.body.classList.toggle('map-mode',name==='map');document.querySelectorAll('.view').forEach(e=>e.hidden=e.id!==`view-${name}`);document.querySelectorAll('[data-view]').forEach(e=>{const active=e.dataset.view===name;e.classList.toggle('active',active);if(active)e.setAttribute('aria-current','page');else e.removeAttribute('aria-current');});if(name==='map')openMap(state.spot,spot=>{state.spot=spot;view('overview');},toast,spot=>{state.controller?.abort();state.controller=null;state.spot=spot;write('spot',spot);state.data=cachedForecast(spot);state.loading=false;state.error=null;renderSpot();});else if(previous==='map')load(state.spot);}
document.querySelectorAll('[data-view]').forEach(e=>e.addEventListener('click',()=>view(e.dataset.view)));
document.querySelectorAll('.close-dialog').forEach(e=>e.addEventListener('click',()=>e.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}));
$('#refresh-button').addEventListener('click',()=>load(state.spot,{force:true}));
$('#favourite-button').addEventListener('click',()=>{state.favorites=saved()?state.favorites.filter(s=>locationKey(s)!==locationKey(state.spot)):[...state.favorites,state.spot];if(!write('favorites',state.favorites))toast('Device storage unavailable. Spot saved for this session.');else toast(saved()?'Spot saved on this device':'Spot removed');renderSpot();});
$('#saved-spots').addEventListener('click',e=>{const b=e.target.closest('[data-favorite]');if(b)load(state.favorites[Number(b.dataset.favorite)]);});
document.querySelectorAll('[data-range]').forEach(e=>e.addEventListener('click',()=>{state.range=Number(e.dataset.range);document.querySelectorAll('[data-range]').forEach(b=>{b.classList.toggle('selected',b===e);b.setAttribute('aria-pressed',String(b===e));});renderHourly();}));
$('#daily-content').addEventListener('click',e=>{const b=e.target.closest('[data-day]');if(b){state.day=Number(b.dataset.day);renderDays();}});
function openSettings(){const f=$('#settings-form');Object.entries(state.settings).forEach(([k,v])=>{if(f.elements[k])f.elements[k].value=v;});$('#settings-dialog').showModal();}
$('#settings-button').addEventListener('click',openSettings);$('#edit-limits').addEventListener('click',openSettings);
$('#settings-form').addEventListener('submit',e=>{e.preventDefault();const f=e.target;state.settings={unit:f.elements.unit.value,wind:Number(f.elements.wind.value),gust:Number(f.elements.gust.value),wave:Number(f.elements.wave.value)};const persisted=write('settings',state.settings);$('#settings-dialog').close();render();document.dispatchEvent(new CustomEvent('preferences-change'));toast(persisted?'Preferences saved':'Preferences applied for this session only');});
document.addEventListener('forecast-models-change',()=>{if(state.view!=='map')load(state.spot);});
document.addEventListener('open-map-tides',()=>view('fishing'));
window.harbourBack=()=>{const dialog=document.querySelector('dialog[open]');if(dialog){dialog.close();return true;}const tools=$('#map-tools');if(tools.open){tools.open=false;return true;}if($('#map-sidebar').classList.contains('is-open')){$('#map-panel-close').click();return true;}if(state.view==='map'&&!$('#map-weather').hidden){if($('#map-weather').classList.contains('is-expanded'))$('#map-weather-expand').click();else if(!$('#map-weather').classList.contains('collapsed'))$('#map-weather-collapse').click();else $('#map-weather-close').click();return true;}if(state.view!=='overview'){view('overview');return true;}return false;};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.querySelector('dialog[open]'))window.harbourBack();});
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
