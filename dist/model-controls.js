import {WEATHER_MODELS,WAVE_MODELS,selectedModels,normaliseModels} from './models.js';
import {modelSelection,write} from './storage.js';
let latest;
const $=s=>document.querySelector(s);
function modelDetail(kind){const list=kind==='weather'?WEATHER_MODELS:WAVE_MODELS,m=list.find(m=>m.id===$(`#${kind}-model`).value);const p=$(`#${kind}-model-detail`);p.textContent=m.detail+' ';const link=document.createElement('a');link.href=m.url;link.target='_blank';link.rel='noopener';link.textContent=m.centre+' ↗';p.append(link);}
function summaries(){const s=selectedModels(modelSelection());document.querySelectorAll('[data-model-summary]').forEach(e=>{e.textContent=s.weather.name===s.wave.name?s.weather.name:s.weather.name+' / '+s.wave.name;});}
function fieldSources(){
  const target=$('#model-field-sources');target.replaceChildren();if(!latest?.sources){target.textContent='Load a forecast to see its field sources.';return;}
  const s=latest.sources,extra=new Set(s.supplementedFields||[]);
  for(const [label,source]of [['Wind & gusts',s.weather],['Waves',s.marine||'Unavailable'],['Swell',extra.has('swell')?'Marine best match':s.marine||'Unavailable'],['Water & currents',extra.has('water')||extra.has('current')?'Marine best match':s.marine||'Unavailable'],['Visibility',extra.has('visibility')?'Weather best match':s.weather]]){const p=document.createElement('p');p.textContent=label+': '+source;target.append(p);}
}
export function initModelControls(){
  for(const [kind,list]of [['weather',WEATHER_MODELS],['wave',WAVE_MODELS]]){$(`#${kind}-model`).append(...list.map(m=>new Option(m.name,m.id)));$(`#${kind}-model`).addEventListener('change',()=>modelDetail(kind));}
  document.querySelectorAll('[data-open-models]').forEach(button=>button.addEventListener('click',()=>{const selection=modelSelection();$('#weather-model').value=selection.weather;$('#wave-model').value=selection.wave;modelDetail('weather');modelDetail('wave');$('#models-dialog').showModal();}));
  $('#models-form').addEventListener('submit',e=>{e.preventDefault();const selection=normaliseModels({weather:$('#weather-model').value,wave:$('#wave-model').value});write('forecast-models',selection);$('#models-dialog').close();summaries();document.dispatchEvent(new CustomEvent('forecast-models-change',{detail:selection}));});
  document.addEventListener('forecast-provenance',e=>{latest=e.detail;fieldSources();});
  summaries();fieldSources();
}
