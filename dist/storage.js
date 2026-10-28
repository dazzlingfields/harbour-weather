const prefix='harbour:v1:';
export function read(key,fallback) {try{return JSON.parse(localStorage.getItem(prefix+key))??fallback;}catch{return fallback;}}
export function write(key,value) {try{localStorage.setItem(prefix+key,JSON.stringify(value));return true;}catch{return false;}}
export const locationKey = spot=>`${spot.lat.toFixed(3)},${spot.lon.toFixed(3)}`;
export const cachedForecast = spot=>read('forecast:'+locationKey(spot),null);
export const cacheForecast = (spot,data)=>write('forecast:'+locationKey(spot),data);
