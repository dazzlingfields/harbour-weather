import {WEATHER_MODELS,WAVE_MODELS,selectedModels,normaliseModels} from './models.js';
import {modelSelection,write,read} from './storage.js';
import {finite,number} from './forecast.js';
import {confidenceLevel} from './blend.js';
import {formatValue,unitLabel} from './units.js';
let latest,selectedRow;
const $=s=>document.querySelector(s);
const presets={blend:{weather:'blend',wave:'blend'},ecmwf:{weather:'ecmwf_ifs',wave:'ecmwf_wam'},gfs:{weather:'gfs_global',wave:'ncep_gfswave025'},icon:{weather:'icon_global',wave:'meteofrance_wave'}};
function modelDetail(kind){const list=kind==='weather'?WEATHER_MODELS:WAVE_MODELS,m=list.find(m=>m.id===$(`#${kind}-model`).value);$(`#${kind}-model-detail`).textContent=m.detail;}
function summaries(){const selection=modelSelection(),s=selectedModels(selection);document.querySelectorAll('[data-model-summary]').forEach(e=>{e.textContent=s.weather.name===s.wave.name?s.weather.name:s.weather.name+' / '+s.wave.name;});document.querySelectorAll('[data-model-preset]').forEach(e=>{const p=presets[e.dataset.modelPreset];e.setAttribute('aria-pressed',String(p.weather===selection.weather&&p.wave===selection.wave));});}
function confidence(){
  const row=selectedRow||latest?.rows.find(r=>r.ts<=Date.now()/1000&&r.ts+3600>Date.now()/1000),score=row?.blend?.score;
  const blending=Object.values(modelSelection()).includes('blend'),stale=latest&&(Date.now()-latest.fetchedAt>6*3600000||!navigator.onLine);
  const selection=modelSelection(),scope=selection.weather==='blend'&&selection.wave==='blend'?'':selection.weather==='blend'?'Weather ': 'Wave ';
  document.querySelectorAll('[data-blend-confidence]').forEach(e=>{e.hidden=!blending;e.dataset.level=stale?'low':confidenceLevel(score).toLowerCase();e.textContent=stale?'Saved confidence':finite(score)?`${scope}${confidenceLevel(score).toLowerCase()} confidence`:'Confidence unavailable';e.title='Agreement and coverage index, not a probability of accuracy. Open the model selector for details.';});
  $('#blend-explanation').hidden=!blending;const text=$('#blend-confidence-detail');
  if(!latest){text.textContent='Confidence appears when the forecast loads.';$('#blend-ranges').replaceChildren();return;}
  const s=latest.sources,count=`Weather ${s.weatherMembers?.length||0}/${s.expectedWeather||1} · waves ${s.waveMembers?.length||0}/${s.expectedWaves||1} models`;
  text.textContent=(finite(score)?`${scope}${confidenceLevel(score)} · ${score}/100 confidence index. `:'Insufficient model coverage for a confidence index. ')+count+(stale?'. Saved forecast · refresh to reassess.':'');
  const fields=row?.blend?.fields||{},settings=read('settings',{});
  $('#blend-ranges').replaceChildren(...[['wind','Wind','speed'],['gust','Gusts','speed'],['wave','Waves','height']].map(([key,label,kind])=>{const p=document.createElement('p'),f=fields[key];p.textContent=f?.count?`${label}: ${formatValue(f.min,kind,settings)}–${formatValue(f.max,kind,settings)} ${unitLabel(kind,settings)} · ${f.count} model${f.count===1?'':'s'}`:`${label}: single model or unavailable`;return p;}));
}
function fieldSources(){const target=$('#model-field-sources');target.replaceChildren();if(!latest?.sources){target.textContent='Load a forecast to see its field sources.';return;}const s=latest.sources,extra=new Set(s.supplementedFields||[]);for(const [label,source]of [['Wind & gusts',s.weather],['Waves',s.marine||'Unavailable'],['Swell',extra.has('swell')?'Marine best match':s.marine||'Unavailable'],['Water & currents',extra.has('water')||extra.has('current')?'Marine best match':s.marine||'Unavailable'],['Visibility',extra.has('visibility')?'Weather best match':s.weather],['Weather members',(s.weatherMembers||[]).join(', ')||s.weather],['Wave members',(s.waveMembers||[]).join(', ')||s.marine||'Unavailable']]){const p=document.createElement('p');p.textContent=label+': '+source;target.append(p);}}
function apply(selection){write('forecast-models-v2',normaliseModels(selection));latest=null;selectedRow=null;$('#models-dialog').close();summaries();confidence();document.dispatchEvent(new CustomEvent('forecast-models-change',{detail:selection}));}
export function initModelControls(){
  for(const [kind,list]of [['weather',WEATHER_MODELS],['wave',WAVE_MODELS]]){$(`#${kind}-model`).append(...list.map(m=>new Option(m.name,m.id)));$(`#${kind}-model`).addEventListener('change',()=>modelDetail(kind));}
  document.querySelectorAll('[data-open-models]').forEach(button=>button.addEventListener('click',()=>{const selection=modelSelection();$('#weather-model').value=selection.weather;$('#wave-model').value=selection.wave;modelDetail('weather');modelDetail('wave');confidence();$('#models-dialog').showModal();}));
  document.querySelectorAll('[data-model-preset]').forEach(button=>button.addEventListener('click',()=>apply(presets[button.dataset.modelPreset])));
  $('#models-form').addEventListener('submit',e=>{e.preventDefault();apply({weather:$('#weather-model').value,wave:$('#wave-model').value});});
  document.addEventListener('forecast-provenance',e=>{latest=e.detail;selectedRow=null;fieldSources();confidence();});
  document.addEventListener('forecast-hour-change',e=>{selectedRow=e.detail;confidence();});
  document.addEventListener('preferences-change',confidence);window.addEventListener('offline',confidence);setInterval(confidence,60000);summaries();fieldSources();confidence();
}
