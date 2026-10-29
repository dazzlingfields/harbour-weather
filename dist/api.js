import {normalise,supplementRows,finite} from './forecast.js';
import {modelSelection} from './storage.js';
import {normaliseModels,selectedModels,BLEND_WEATHER,BLEND_WAVES} from './models.js';
import {blendRows,blendDaily} from './blend.js';
export const SPOTS = [
  {name:'Hauraki Gulf',area:'Auckland',lat:-36.75,lon:175.05},
  {name:'Bay of Islands',area:'Northland',lat:-35.20,lon:174.20},
  {name:'Bream Bay',area:'Northland',lat:-35.90,lon:174.55},
  {name:'Mercury Bay',area:'Coromandel',lat:-36.80,lon:175.80},
  {name:'Tauranga',area:'Bay of Plenty',lat:-37.60,lon:176.20},
  {name:'Raglan',area:'Waikato',lat:-37.80,lon:174.75},
  {name:'Wellington',area:'Cook Strait',lat:-41.35,lon:174.85},
  {name:'Queen Charlotte Sound',area:'Marlborough',lat:-41.20,lon:174.15},
  {name:'Tasman Bay',area:'Nelson',lat:-41.10,lon:173.25},
  {name:'Akaroa',area:'Canterbury',lat:-43.90,lon:172.95},
  {name:'Otago coast',area:'Dunedin',lat:-45.90,lon:170.65},
  {name:'Foveaux Strait',area:'Southland',lat:-46.70,lon:168.25}
];
async function json(url,signal) {
  const requestSignal=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(8000)]);
  const response=await fetch(url,{signal:requestSignal});
  if(!response.ok) {const error=new Error(response.status===429?'Forecast request limit reached. Please try again shortly.':'Forecast provider is unavailable. Please try again.');error.status=response.status;throw error;}
  const data=await response.json(); if(data.error) throw new Error(data.reason || 'Forecast request failed.'); return data;
}
export function forecastURLs(spot,selection){
  const models=normaliseModels(selection);
  const base={latitude:spot.lat,longitude:spot.lon,timezone:'Pacific/Auckland',timeformat:'unixtime',forecast_hours:168};
  const wu=new URL('https://api.open-meteo.com/v1/forecast');
  wu.search=new URLSearchParams({...base,models:models.weather,wind_speed_unit:'kn',cell_selection:'nearest',hourly:'temperature_2m,precipitation_probability,precipitation,weather_code,pressure_msl,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day',daily:'sunrise,sunset,uv_index_max,temperature_2m_max,temperature_2m_min'});
  const mu=new URL('https://marine-api.open-meteo.com/v1/marine');
  mu.search=new URLSearchParams({...base,models:models.wave,wind_speed_unit:'kn',cell_selection:'sea',hourly:'wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,sea_surface_temperature,ocean_current_velocity,ocean_current_direction'});
  if(models.weather==='blend')wu.searchParams.set('models',BLEND_WEATHER.join(','));
  if(models.wave==='blend')mu.searchParams.set('models',BLEND_WAVES.join(','));
  return {weather:wu,marine:mu};
}
export async function fetchForecast(spot,signal,selection=modelSelection()) {
  if(Object.values(normaliseModels(selection)).includes('blend'))return fetchBlendedForecast(spot,signal,selection);
  const models=normaliseModels(selection),sources=selectedModels(models),{weather:wu,marine:mu}=forecastURLs(spot,models);
  const [w,m]=await Promise.allSettled([json(wu,signal),json(mu,signal)]);
  if(w.status==='rejected') throw w.reason;
  if(signal.aborted) throw new DOMException('Aborted','AbortError');
  const marine=m.status==='fulfilled'?m.value:null;
  let rows=normalise(w.value,marine);const auxiliaries=[];
  const marineFields=['swell','swellDir','swellPeriod','water','current','currentDir'];
  const needsMarine=models.wave!=='best_match'&&rows.some(r=>marineFields.some(k=>!finite(r[k])));
  const needsVisibility=models.weather!=='best_match'&&rows.some(r=>!finite(r.visibility));
  const supplements=await Promise.allSettled([
    needsMarine?json(forecastURLs(spot,{weather:models.weather,wave:'best_match'}).marine,signal):Promise.resolve(null),
    needsVisibility?(()=>{const u=forecastURLs(spot,{weather:'best_match',wave:models.wave}).weather;u.searchParams.set('hourly','visibility');u.searchParams.delete('daily');return json(u,signal);})():Promise.resolve(null)
  ]);
  if(signal.aborted)throw new DOMException('Aborted','AbortError');
  if(supplements[0].status==='fulfilled'&&supplements[0].value){const extra=supplements[0].value;rows=supplementRows(rows,normalise(w.value,extra),marineFields,'marine_best_match');auxiliaries.push({id:'marine_best_match',name:'Marine best match',grid:{lat:extra.latitude,lon:extra.longitude}});}
  if(supplements[1].status==='fulfilled'&&supplements[1].value){const extra=supplements[1].value;rows=supplementRows(rows,normalise(extra,null),['visibility'],'weather_best_match');auxiliaries.push({id:'weather_best_match',name:'Weather best match',grid:{lat:extra.latitude,lon:extra.longitude}});}
  const supplementedFields=[...new Set(rows.flatMap(r=>Object.keys(r.supplemented||{})))];
  return {rows,daily:w.value.daily,zone:w.value.timezone||'Pacific/Auckland',fetchedAt:Date.now(),marineAvailable:!!marine,grid:marine?{lat:marine.latitude,lon:marine.longitude}:null,weatherGrid:{lat:w.value.latitude,lon:w.value.longitude},modelSelection:models,sources:{provider:'Open-Meteo',weather:sources.weather.name,marine:marine?sources.wave.name:null,weatherCentre:sources.weather.centre,waveCentre:marine?sources.wave.centre:null,auxiliaries,supplementedFields},schemaVersion:4};
}
// Multi-model API fields carry a model suffix. Never treat best-match extras
// as independent votes, or count a model whose values are entirely missing.
export function splitModelData(data,id,multiple=true){
  const result={...data};
  for(const section of ['hourly','daily'])if(data?.[section]){
    result[section]={time:data[section].time};
    for(const [key,value]of Object.entries(data[section]))if(key.endsWith('_'+id))result[section][key.slice(0,-id.length-1)]=value;
    if(!multiple)result[section]=data[section];
  }
  return result;
}
async function modelBatch(spot,kind,ids,signal){
  const endpoint=kind==='weather'?'weather':'marine';
  const url=forecastURLs(spot,{weather:ids[0],wave:ids[0]})[endpoint];url.searchParams.set('models',ids.join(','));
  try{
    const data=await json(url,signal);
    return ids.map(id=>({id,data:splitModelData(data,id,ids.length>1)}));
  }catch(error){
    if(signal.aborted||error.name==='AbortError'||error.status===429||ids.length===1)throw error;
    const results=await Promise.allSettled(ids.map(async id=>{const single=new URL(url);single.searchParams.set('models',id);return{id,data:await json(single,signal)};}));
    const available=results.filter(r=>r.status==='fulfilled').map(r=>r.value);if(!available.length)throw error;return available;
  }
}
async function fetchBlendedForecast(spot,signal,selection){
  const models=normaliseModels(selection),chosen=selectedModels(models);
  const [w,m]=await Promise.allSettled([modelBatch(spot,'weather',models.weather==='blend'?BLEND_WEATHER:[models.weather],signal),modelBatch(spot,'marine',models.wave==='blend'?BLEND_WAVES:[models.wave],signal)]);
  if(signal.aborted)throw new DOMException('Aborted','AbortError');if(w.status==='rejected')throw w.reason;
  const weatherMembers=w.value.filter(e=>e.data.hourly?.time?.length).map(e=>({...e,rows:normalise(e.data,null)})).filter(e=>e.rows.some(r=>finite(r.wind)));
  if(!weatherMembers.length)throw Error('Weather models returned no usable wind forecast.');
  const base=weatherMembers[0].data;
  const marineMembers=(m.status==='fulfilled'?m.value:[]).map(e=>({...e,rows:normalise(base,e.data).map(r=>{const copy={ts:r.ts};for(const key of ['wave','waveDir','period','swell','swellDir','swellPeriod','water','current','currentDir'])copy[key]=r[key];return copy;})})).filter(e=>e.rows.some(r=>finite(r.wave)));
  const weatherRows=models.weather==='blend'?blendRows(weatherMembers):weatherMembers[0].rows;
  const marineRows=models.wave==='blend'?blendRows(marineMembers):marineMembers[0]?.rows||[];
  const marineByTime=new Map(marineRows.map(r=>[r.ts,r]));
  let rows=weatherRows.map(wr=>{const mr=marineByTime.get(wr.ts),row={...wr};for(const k of ['wave','waveDir','period','swell','swellDir','swellPeriod','water','current','currentDir'])row[k]=mr?.[k]??null;
    const fields={...wr.blend?.fields};for(const [k,v]of Object.entries(mr?.blend?.fields||{}))if(['wave','waveDir','period','swell','swellDir','swellPeriod','water','current','currentDir'].includes(k))fields[k]=v;
    const required=[...(models.weather==='blend'?['wind','gust','dir']:[]),...(models.wave==='blend'?['wave','waveDir']:[])];
    const scores=required.map(k=>fields[k]?.score);row.blend={fields,score:scores.every(finite)?Math.min(...scores):null};return row;});
  const extras=['water','current','currentDir','visibility','swell','swellDir','swellPeriod'],auxiliaries=[];
  const needMarine=rows.some(r=>extras.filter(k=>k!=='visibility').some(k=>!finite(r[k])));
  const needVisibility=rows.some(r=>!finite(r.visibility));
  const extra=await Promise.allSettled([needMarine?json(forecastURLs(spot,{wave:'best_match'}).marine,signal):null,needVisibility?(()=>{const url=forecastURLs(spot,{weather:'best_match'}).weather;url.searchParams.set('hourly','visibility');url.searchParams.delete('daily');return json(url,signal);})():null]);
  if(signal.aborted)throw new DOMException('Aborted','AbortError');
  if(extra[0].status==='fulfilled'&&extra[0].value){rows=supplementRows(rows,normalise(base,extra[0].value),extras.filter(k=>k!=='visibility'),'marine_best_match');auxiliaries.push({id:'marine_best_match',name:'Marine best match'});}
  if(extra[1].status==='fulfilled'&&extra[1].value){rows=supplementRows(rows,normalise(extra[1].value,null),['visibility'],'weather_best_match');auxiliaries.push({id:'weather_best_match',name:'Weather best match'});}
  const marine=marineMembers[0]?.data;
  return {rows,daily:models.weather==='blend'?blendDaily(rows,base.daily):base.daily,zone:base.timezone||'Pacific/Auckland',fetchedAt:Date.now(),marineAvailable:marineMembers.length>0,grid:marine?{lat:marine.latitude,lon:marine.longitude}:null,weatherGrid:{lat:base.latitude,lon:base.longitude},modelSelection:models,schemaVersion:4,sources:{provider:'Open-Meteo',weather:chosen.weather.name,marine:marineMembers.length?chosen.wave.name:null,weatherCentre:chosen.weather.centre,waveCentre:chosen.wave.centre,weatherMembers:weatherMembers.map(e=>e.id),waveMembers:marineMembers.map(e=>e.id),expectedWeather:models.weather==='blend'?3:1,expectedWaves:models.wave==='blend'?3:1,auxiliaries,supplementedFields:[...new Set(rows.flatMap(r=>Object.keys(r.supplemented||{})))]}};
}
export async function searchLocations(query,signal) {
  const u=new URL('https://geocoding-api.open-meteo.com/v1/search');
  u.search=new URLSearchParams({name:query,count:8,language:'en',format:'json',countryCode:'NZ'});
  const data=await json(u,signal);
  return (data.results||[]).filter(r=>r.country_code==='NZ').map(r=>({name:r.name,area:r.admin1||'New Zealand',lat:r.latitude,lon:r.longitude}));
}
