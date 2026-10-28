import {normalise,supplementRows,finite} from './forecast.js';
import {modelSelection} from './storage.js';
import {normaliseModels,selectedModels} from './models.js';
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
  const response=await fetch(url,{signal});
  if(!response.ok) throw new Error(response.status===429?'Forecast request limit reached. Please try again shortly.':'Forecast provider is unavailable. Please try again.');
  const data=await response.json(); if(data.error) throw new Error(data.reason || 'Forecast request failed.'); return data;
}
export function forecastURLs(spot,selection){
  const models=normaliseModels(selection);
  const base={latitude:spot.lat,longitude:spot.lon,timezone:'Pacific/Auckland',timeformat:'unixtime',forecast_hours:168};
  const wu=new URL('https://api.open-meteo.com/v1/forecast');
  wu.search=new URLSearchParams({...base,models:models.weather,wind_speed_unit:'kn',cell_selection:'nearest',hourly:'temperature_2m,precipitation_probability,precipitation,weather_code,pressure_msl,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day',daily:'sunrise,sunset,uv_index_max,temperature_2m_max,temperature_2m_min'});
  const mu=new URL('https://marine-api.open-meteo.com/v1/marine');
  mu.search=new URLSearchParams({...base,models:models.wave,wind_speed_unit:'kn',cell_selection:'sea',hourly:'wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,sea_surface_temperature,ocean_current_velocity,ocean_current_direction'});
  return {weather:wu,marine:mu};
}
export async function fetchForecast(spot,signal,selection=modelSelection()) {
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
  return {rows,daily:w.value.daily,zone:w.value.timezone||'Pacific/Auckland',fetchedAt:Date.now(),marineAvailable:!!marine,grid:marine?{lat:marine.latitude,lon:marine.longitude}:null,weatherGrid:{lat:w.value.latitude,lon:w.value.longitude},modelSelection:models,sources:{provider:'Open-Meteo',weather:sources.weather.name,marine:marine?sources.wave.name:null,weatherCentre:sources.weather.centre,waveCentre:marine?sources.wave.centre:null,auxiliaries,supplementedFields},schemaVersion:3};
}
export async function searchLocations(query,signal) {
  const u=new URL('https://geocoding-api.open-meteo.com/v1/search');
  u.search=new URLSearchParams({name:query,count:8,language:'en',format:'json',countryCode:'NZ'});
  const data=await json(u,signal);
  return (data.results||[]).filter(r=>r.country_code==='NZ').map(r=>({name:r.name,area:r.admin1||'New Zealand',lat:r.latitude,lon:r.longitude}));
}
