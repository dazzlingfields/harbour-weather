import {SPOTS,fetchForecast,searchLocations} from './api.js';
import {read,write,cachedForecast,cacheForecast,locationKey} from './storage.js';
import {finite,number,direction,clock,dateKey,weather,assess,tripWindows,moonPhase,NZ_ZONE} from './forecast.js';
import {loadTides,renderTides} from './tides.js';
import {openMap} from './map.js';
const $=s=>document.querySelector(s);
import {icon} from './icons.js';
import {hourlyTable,intensity} from './hourly.js';
import {initModelControls} from './model-controls.js';
import {normaliseSettings,initPreferences} from './preferences.js';
import {quantity,formatValue,unitLabel} from './units.js';
import {windTrend} from './trend.js';
import {initTripPlanner,hourlyList} from './trip.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
document.querySelectorAll('[data-icon]').forEach(e=>e.innerHTML=icon(e.dataset.icon));
initModelControls();
const native=window.Capacitor?.isNativePlatform?.();document.body.classList.toggle('native-app',!!native);
if(native)$('#install-note').textContent='Harbour 0.5.0 · Android app';
const initialSettings=read('settings',{});
const state={spot:read('spot',SPOTS[0]),favorites:read('favorites',[]),settings:normaliseSettings(initialSettings),data:null,range:24,day:null,controller:null,loading:false,offline:false,error:null,view:'overview'};
const speed=n=>formatValue(n,'speed',state.settings);
const unit=()=>unitLabel('speed',state.settings);
const sea=n=>quantity(n,'height',state.settings);
const temp=n=>quantity(n,'temperature',state.settings);
const distance=n=>quantity(n,'distance',state.settings);
const dayLabel=ts=>new Intl.DateTimeFormat('en-NZ',{timeZone:NZ_ZONE,weekday:'short',day:'numeric',month:'short'}).format(new Date(ts*1000));
const arrow=n=>finite(n)?`<span class="direction-arrow" style="transform:rotate(${n+180}deg)" aria-hidden="true">↑</span>`:'';
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('visible'),3500);}
function saved() {return state.favorites.some(s=>locationKey(s)===locationKey(state.spot));}
function renderSpot(){
  $('#spot-name').textContent=state.spot.name;$('#spot-area').textContent=state.spot.area;
  document.title=`${state.spot.name} · Harbour`;
  $('#save-label').textContent=saved()?'Saved':'Save spot';$('#favourite-button').setAttribute('aria-pressed',String(saved()));
  $('#favourite-button').style.background=saved()?'#e9e7de':'';
  $('#saved-spots').innerHTML=state.favorites.map((s,i)=>`<button class="spot-chip" data-favorite="${i}">${esc(s.name)}</button>`).join('');
}
function renderStatus(){
  const e=$('#data-status');e.className='data-status';
  if(state.loading){e.textContent=state.data?'Refreshing forecast…':'Loading weather and marine forecast…';return;}
  if(!state.data){e.classList.add('error');e.textContent=state.error||'Forecast unavailable. Try Refresh.';return;}
  const age=Date.now()-state.data.fetchedAt,stale=age>6*3600*1000;
  if(state.offline||stale||state.error)e.classList.add('stale');
  const stamp=new Intl.DateTimeFormat('en-NZ',{timeZone:NZ_ZONE,day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(new Date(state.data.fetchedAt));
  const prefix=state.offline?'Offline · saved':state.error?'Refresh failed · saved':stale?'Saved':'Updated';
  e.innerHTML=`<span class="status-dot"></span>${prefix} ${esc(stamp)} NZ time${state.data.marineAvailable?'':' · Marine data unavailable'}`;
}
function current(){return state.data?.rows.find(r=>r.ts<=Date.now()/1000&&r.ts+3600>Date.now()/1000)||null;}
function renderCurrent(){
  const r=current()||{},w=weather(r.code),rating=assess(r,state.settings),old=state.offline||state.error||state.data&&Date.now()-state.data.fetchedAt>6*3600000;
  $('#current-time').textContent=finite(r.ts)?clock(r.ts)+' NZ time':'No current hour';
  $('#conditions-main').innerHTML=`<div class="wind-reading"><strong>${speed(r.wind)}<small>${unit()}</small></strong><p>From ${direction(r.dir)} <span>· gusts ${speed(r.gust)} ${unit()}</span></p></div><div class="wind-bearing" aria-label="Wind from ${direction(r.dir)}"><span>N</span><svg viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="30"/><path d="M40 8v7m0 50v7M8 40h7m50 0h7"/><g transform="rotate(${finite(r.dir)?r.dir:0} 40 40)"><path class="bearing-head" d="m40 18 9 30-9-5-9 5Z"/></g></svg></div>`;
  $('#condition-rating').className='condition-rating '+(old?'unknown':rating.kind);$('#condition-rating').textContent=old?'Saved forecast':rating.kind==='above'?'Outside your limits':rating.kind==='within'?'Matches your limits':'Check the forecast';
  const reasons=rating.label==='A model exceeds your limits'?'At least one model is above your wind or wave limits.':rating.label==='Above your limits'?'Wind, gusts or waves are above your limits.':rating.kind==='within'?'Current forecast meets your selected filters.':rating.label;
  $('#condition-summary').textContent=old?'Refresh for the latest conditions.':state.data?reasons:'Choose a spot or refresh to load weather.';
  $('#current-date').textContent=finite(r.ts)?dayLabel(r.ts):'—';
  const seaRow=(label,value,period,dir)=>`<article class="sea-reading"><div>${icon('waves')}<span>${label}</span></div><strong>${sea(value)}</strong><p>${number(period)} s <span>· from ${direction(dir)}</span></p></article>`;
  $('#metrics').innerHTML=seaRow('Waves',r.wave,r.period,r.waveDir)+seaRow('Swell',r.swell,r.swellPeriod,r.swellDir);
  $('#quick-conditions').innerHTML=`<div class="weather-inline">${icon(r.isDay===0&&w.icon==='sun'?'moon':w.icon)}<span>${w.label} <b>${temp(r.temp)}</b></span></div><div><span>Water</span><b>${temp(r.water)}</b></div><div><span>Visibility</span><b>${distance(finite(r.visibility)?r.visibility/1000:null)}</b></div>`;
}
function forecastTable(rows){return hourlyTable(rows,{settings:state.settings,more:true});}
function renderHourly(){const start=Math.floor(Date.now()/3600000)*3600,rows=(state.data?.rows||[]).filter(r=>r.ts>=start).slice(0,state.range);$('#hourly-content').innerHTML=forecastTable(rows);$('#wind-trend').innerHTML=windTrend(rows,state.settings);}
function renderWindows(){
  const s=state.settings;$('#limits-note').textContent=`Wind ≤ ${speed(s.wind)} ${unit()} · gusts ≤ ${speed(s.gust)} · waves ≤ ${sea(s.wave)}`;
  const stale=state.data&&Date.now()-state.data.fetchedAt>6*3600000;
  if(!state.data||state.offline||state.error||stale){$('#trip-windows').innerHTML='<p class="empty-state">Refresh online to find matching hours.</p>';return;}
  const windows=tripWindows(state.data.rows,state.data.daily,s);
  $('#trip-windows').innerHTML=windows.length?windows.map(w=>`<div class="window"><span class="window-dot" aria-hidden="true">${icon('arrowRight')}</span><div class="window-time">${esc(dayLabel(w.start))}<strong>${esc(clock(w.start))}–${esc(clock(w.end))}</strong><small>Wind up to ${speed(w.wind)} ${unit()} · sea up to ${sea(w.wave)}</small></div><span class="window-duration">${w.hours}h</span></div>`).join(''):`<p class="empty-state">No ${s.minHours}-hour${s.daylightOnly?' daylight':''} window meets all your limits in the next ${s.horizon===24?'24 hours':s.horizon/24+' days'}.</p>`;
}
function todayIndex(){return state.data?.daily?.time.findIndex(t=>dateKey(t)===dateKey(Date.now()/1000))??-1;}
function renderSun(){const d=state.data?.daily,i=todayIndex(),r=current()||{};$('#daylight-content').innerHTML=`<div><span>Sunrise</span><strong>${clock(d?.sunrise?.[i])}</strong></div><div><span>Sunset</span><strong>${clock(d?.sunset?.[i])}</strong></div>`;$('#extra-content').innerHTML=`<div><span>UV today</span><b>${number(d?.uv_index_max?.[i],1)}</b></div><div><span>Rain chance</span><b>${number(r.rain)}%</b></div><div><span>Pressure</span><b>${quantity(r.pressure,'pressure',state.settings)}</b></div>`;}
function max(rows,k){const a=rows.map(r=>r[k]).filter(finite);return a.length?Math.max(...a):null;}
function renderDays(){
  const d=state.data?.daily;
  if(!d?.time){$('#daily-content').innerHTML='<p class="empty-state">Load a forecast to see the week ahead.</p>';$('#day-detail').innerHTML='';$('#forecast-day-summary').innerHTML='';return;}
  if(!d.time.includes(state.day))state.day=d.time[0];
  $('#daily-content').innerHTML=d.time.slice(0,7).map((ts,i)=>{const rows=state.data.rows.filter(r=>dateKey(r.ts)===dateKey(ts)),noon=rows.find(r=>new Intl.DateTimeFormat('en-GB',{timeZone:NZ_ZONE,hour:'2-digit',hour12:false}).format(new Date(r.ts*1000))==='12')||rows[0]||{},name=new Intl.DateTimeFormat('en-NZ',{timeZone:NZ_ZONE,weekday:'short'}).format(new Date(ts*1000)),day=new Intl.DateTimeFormat('en-NZ',{timeZone:NZ_ZONE,day:'numeric'}).format(new Date(ts*1000));return `<button class="day-card ${state.day===ts?'selected':''}" data-day="${ts}" aria-pressed="${state.day===ts}" aria-label="${esc(dayLabel(ts))}, ${weather(noon.code).label}"><span class="day-name">${name}</span><span class="day-date">${day}</span>${icon(weather(noon.code).icon)}<span class="day-temp">${formatValue(d.temperature_2m_max?.[i],'temperature',state.settings)}°</span></button>`;}).join('');
  const rows=state.data.rows.filter(r=>dateKey(r.ts)===dateKey(state.day));
  $('#day-detail-heading').textContent=dayLabel(state.day);$('#day-detail').innerHTML=hourlyList(rows,state.settings);
  const item=(label,value)=>`<div><span>${label}</span><strong>${value}</strong></div>`;
  $('#forecast-day-summary').innerHTML=item('Wind high',speed(max(rows,'wind'))+' '+unit())+item('Gust high',speed(max(rows,'gust'))+' '+unit())+item('Wave high',sea(max(rows,'wave')));
}
function renderFishing(){const r=current()||{},d=state.data?.daily,i=todayIndex(),moon=moonPhase(Date.now()/1000);const fact=(name,val)=>`<div class="fact"><span>${name}</span><strong>${val}</strong></div>`;$('#fishing-content').innerHTML=fact('Water temperature',temp(r.water))+fact('Sunrise / sunset',`${clock(d?.sunrise?.[i])} / ${clock(d?.sunset?.[i])}`)+fact('Moon phase',`${moon.label}<small>Approx. ${moon.illumination}% illuminated</small>`)+fact('Offshore model current',`${formatValue(r.current,'speed',state.settings,1)} ${unit()} · towards ${direction(r.currentDir)}<small>Not a channel or bar tidal stream forecast</small>`)+fact('Sea-level pressure',quantity(r.pressure,'pressure',state.settings));}
function render(){renderSpot();renderStatus();renderCurrent();renderHourly();renderWindows();renderSun();renderDays();renderFishing();planner.refresh();if(state.view!=='map')document.dispatchEvent(new CustomEvent('forecast-provenance',{detail:state.data}));$('#location-date').textContent=new Intl.DateTimeFormat('en-NZ',{timeZone:NZ_ZONE,weekday:'long',day:'numeric',month:'long'}).format(new Date());if(state.data?.grid)$('#grid-info').textContent=`Marine model grid: ${state.data.grid.lat.toFixed(3)}, ${state.data.grid.lon.toFixed(3)}. Selected spot: ${state.spot.lat.toFixed(3)}, ${state.spot.lon.toFixed(3)}. These can differ by several kilometres.`;}
async function load(spot=state.spot,{force=false}={}){
  state.controller?.abort();const controller=new AbortController();state.controller=controller;
  state.spot=spot;write('spot',spot);state.data=cachedForecast(spot);state.offline=!navigator.onLine;state.error=null;state.loading=true;state.day=null;render();loadTides(spot);if(state.view==='map')view('map');$('#refresh-button').disabled=true;
  if(!force&&state.data&&Date.now()-state.data.fetchedAt<15*60000){state.loading=false;$('#refresh-button').disabled=false;render();document.dispatchEvent(new CustomEvent('forecast-provenance',{detail:state.data}));return;}
  const timeout=setTimeout(()=>controller.abort(),25000);
  try{const data=await fetchForecast(spot,controller.signal);if(state.controller!==controller)return;state.data=data;state.offline=false;document.dispatchEvent(new CustomEvent('forecast-provenance',{detail:data}));if(!cacheForecast(spot,data))toast('Forecast loaded. Device storage is full or unavailable.');}
  catch(e){if(state.controller!==controller)return;state.offline=!navigator.onLine;state.error=e.name==='AbortError'?'Forecast request timed out. Try Refresh.':e.message;}
  finally{clearTimeout(timeout);if(state.controller===controller){state.loading=false;$('#refresh-button').disabled=false;render();}}
}
function view(name){if(name===state.view)return;const previous=state.view;document.querySelector('#map-tools').open=false;document.querySelector('#map-sidebar').classList.remove('is-open');document.querySelector('#map-sidebar').inert=true;state.view=name;document.body.classList.toggle('map-mode',name==='map');document.querySelectorAll('.view').forEach(e=>e.hidden=e.id!==`view-${name}`);document.querySelectorAll('[data-view]').forEach(e=>{const active=e.dataset.view===name;e.classList.toggle('active',active);if(active)e.setAttribute('aria-current','page');else e.removeAttribute('aria-current');});if(name!=='map')window.scrollTo({top:0,behavior:'instant'});if(name==='map')openMap(state.spot,spot=>{state.spot=spot;view('overview');},toast,spot=>{state.controller?.abort();state.controller=null;state.spot=spot;write('spot',spot);state.data=cachedForecast(spot);state.loading=false;state.error=null;renderSpot();});else if(previous==='map')load(state.spot);}
document.querySelectorAll('[data-view]').forEach(e=>e.addEventListener('click',()=>view(e.dataset.view)));
document.querySelectorAll('.close-dialog').forEach(e=>e.addEventListener('click',()=>e.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}));
$('#refresh-button').addEventListener('click',()=>load(state.spot,{force:true}));
$('#favourite-button').addEventListener('click',()=>{state.favorites=saved()?state.favorites.filter(s=>locationKey(s)!==locationKey(state.spot)):[...state.favorites,state.spot];if(!write('favorites',state.favorites))toast('Device storage unavailable. Spot saved for this session.');else toast(saved()?'Spot saved on this device':'Spot removed');renderSpot();});
$('#saved-spots').addEventListener('click',e=>{const b=e.target.closest('[data-favorite]');if(b)load(state.favorites[Number(b.dataset.favorite)]);});
document.querySelectorAll('[data-range]').forEach(e=>e.addEventListener('click',()=>{state.range=Number(e.dataset.range);document.querySelectorAll('[data-range]').forEach(b=>{b.classList.toggle('selected',b===e);b.setAttribute('aria-pressed',String(b===e));});renderHourly();}));
$('#daily-content').addEventListener('click',e=>{const b=e.target.closest('[data-day]');if(b){state.day=Number(b.dataset.day);renderDays();}});
function renderColourKey(){const s=state.settings;$('#colour-wind-unit').textContent='Wind / gusts ('+unitLabel('speed',s)+')';$('#colour-wave-unit').textContent='Waves / swell ('+unitLabel('height',s)+')';document.querySelectorAll('.colour-key tbody tr').forEach((row,i)=>{for(const [column,kind,steps]of [[1,'speed',[10,15,20,30]],[2,'height',[.5,1,1.5,2.5]]]){const fmt=v=>formatValue(v,kind,s,kind==='speed'&&s.unit==='kn'?0:1);row.children[column].textContent=i===0?'Under '+fmt(steps[0]):i===4?fmt(steps[3])+'+':fmt(steps[i-1])+'–<'+fmt(steps[i]);}});}
renderColourKey();document.addEventListener('preferences-change',renderColourKey);
const preferences=initPreferences({get:()=>state.settings,onSave:settings=>{state.settings=settings;const persisted=write('settings',settings);render();renderTides();document.dispatchEvent(new CustomEvent('preferences-change'));toast(persisted?'Settings saved':'Settings applied for this session');}});
$('#settings-button').addEventListener('click',()=>preferences.open('units'));
$('#map-settings').addEventListener('click',()=>preferences.open('units'));
$('#edit-limits').addEventListener('click',()=>preferences.open('limits'));
document.querySelectorAll('[data-edit-limits]').forEach(e=>e.addEventListener('click',()=>preferences.open('limits')));
$('#trip-shortcut').addEventListener('click',()=>{if(state.view!=='overview')view('overview');$('#trip-planner-title').focus({preventScroll:true});$('#trip-planner-title').scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});});
const planner=initTripPlanner({get:()=>({data:state.data,settings:state.settings,spot:state.spot,offline:state.offline,error:state.error})});

document.addEventListener('forecast-models-change',()=>{if(state.view!=='map')load(state.spot);});
document.addEventListener('open-map-tides',()=>view('fishing'));
window.harbourBack=()=>{const dialog=[...document.querySelectorAll('dialog[open]')].at(-1);if(dialog){dialog.close();return true;}const tools=$('#map-tools');if(tools.open){tools.open=false;return true;}if($('#map-sidebar').classList.contains('is-open')){$('#map-panel-close').click();return true;}if(state.view==='map'&&!$('#map-weather').hidden){if($('#map-weather').classList.contains('is-expanded'))$('#map-weather-expand').click();else if(!$('#map-weather').classList.contains('collapsed'))$('#map-weather-collapse').click();else $('#map-weather-close').click();return true;}if(state.view!=='overview'){view('overview');return true;}return false;};
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
