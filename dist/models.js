export const WEATHER_MODELS=[
  {id:'best_match',name:'Best match',centre:'Open-Meteo',detail:'Automatically selects available models for this location.',url:'https://open-meteo.com/en/docs'},
  {id:'ecmwf_ifs',name:'ECMWF IFS',centre:'ECMWF',detail:'Global weather forecast, about 9 km grid. Hourly values can be interpolated.',url:'https://open-meteo.com/en/docs/ecmwf-api'},
  {id:'gfs_global',name:'NOAA GFS',centre:'NOAA / NCEP',detail:'Global weather forecast, 0.25° grid. Hourly values can be interpolated.',url:'https://open-meteo.com/en/docs/gfs-api'},
  {id:'icon_global',name:'DWD ICON',centre:'Deutscher Wetterdienst',detail:'Global weather forecast. Visibility is supplemented from weather best match when available.',url:'https://open-meteo.com/en/docs/dwd-api'}
];
export const WAVE_MODELS=[
  {id:'best_match',name:'Best match',centre:'Open-Meteo',detail:'Automatic marine selection, including available swell, water temperature and currents.',url:'https://open-meteo.com/en/docs/marine-weather-api'},
  {id:'ecmwf_wam',name:'ECMWF WAM',centre:'ECMWF',detail:'Global waves, about 9 km grid. Swell, water temperature and currents are supplemented from marine best match when available.',url:'https://open-meteo.com/en/docs/marine-weather-api'},
  {id:'ncep_gfswave025',name:'NOAA GFS Wave',centre:'NOAA / NCEP',detail:'Global waves and swell, 0.25° grid. Water temperature and currents are supplemented from marine best match.',url:'https://open-meteo.com/en/docs/marine-weather-api'},
  {id:'meteofrance_wave',name:'Météo-France Wave',centre:'Météo-France / Copernicus Marine',detail:'Global waves and swell, about 8 km grid. Native 3-hourly data is interpolated to hourly. Water temperature and currents use marine best match.',url:'https://open-meteo.com/en/docs/marine-weather-api'}
];
export const DEFAULT_MODELS={weather:'best_match',wave:'best_match'};
export function normaliseModels(value={}){return {weather:WEATHER_MODELS.some(m=>m.id===value?.weather)?value.weather:'best_match',wave:WAVE_MODELS.some(m=>m.id===value?.wave)?value.wave:'best_match'};}
export const modelKey=value=>{const s=normaliseModels(value);return `${s.weather}:${s.wave}`;};
export const selectedModels=value=>{const s=normaliseModels(value);return{weather:WEATHER_MODELS.find(m=>m.id===s.weather),wave:WAVE_MODELS.find(m=>m.id===s.wave)};};
