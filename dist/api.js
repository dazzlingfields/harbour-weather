import {normalise} from './forecast.js';
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
export async function fetchForecast(spot,signal) {
  const base={latitude:spot.lat,longitude:spot.lon,timezone:'Pacific/Auckland',timeformat:'unixtime',forecast_days:7};
  const wu=new URL('https://api.open-meteo.com/v1/forecast');
  wu.search=new URLSearchParams({...base,wind_speed_unit:'kn',cell_selection:'nearest',hourly:'temperature_2m,precipitation_probability,precipitation,weather_code,pressure_msl,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m',daily:'sunrise,sunset,uv_index_max,temperature_2m_max,temperature_2m_min'});
  const mu=new URL('https://marine-api.open-meteo.com/v1/marine');
  mu.search=new URLSearchParams({...base,wind_speed_unit:'kn',cell_selection:'sea',hourly:'wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,sea_surface_temperature,ocean_current_velocity,ocean_current_direction'});
  const [w,m]=await Promise.allSettled([json(wu,signal),json(mu,signal)]);
  if(w.status==='rejected') throw w.reason;
  if(signal.aborted) throw new DOMException('Aborted','AbortError');
  const marine=m.status==='fulfilled'?m.value:null;
  return {rows:normalise(w.value,marine),daily:w.value.daily,zone:w.value.timezone||'Pacific/Auckland',fetchedAt:Date.now(),marineAvailable:!!marine,grid:marine?{lat:marine.latitude,lon:marine.longitude}:null,weatherGrid:{lat:w.value.latitude,lon:w.value.longitude},sources:{weather:'Open-Meteo Forecast API',marine:marine?'Open-Meteo Marine API':null,modelSelection:'Provider default / best match; no model pinned'}};
}
export async function searchLocations(query,signal) {
  const u=new URL('https://geocoding-api.open-meteo.com/v1/search');
  u.search=new URLSearchParams({name:query,count:8,language:'en',format:'json',countryCode:'NZ'});
  const data=await json(u,signal);
  return (data.results||[]).filter(r=>r.country_code==='NZ').map(r=>({name:r.name,area:r.admin1||'New Zealand',lat:r.latitude,lon:r.longitude}));
}
