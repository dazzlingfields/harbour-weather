export const NZ_ZONE = 'Pacific/Auckland';
export const finite = n => typeof n === 'number' && Number.isFinite(n);
export const number = (n, digits = 0) => finite(n) ? n.toFixed(digits) : '—';
export const direction = n => finite(n) ? ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(n / 22.5) % 16] : '—';
const dateFormatters=new Map();
export const dateKey = (ts, zone = NZ_ZONE) => {if(!dateFormatters.has(zone))dateFormatters.set(zone,new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}));return dateFormatters.get(zone).format(new Date(ts*1000));};
export const clock = (ts, zone = NZ_ZONE) => finite(ts) ? new Intl.DateTimeFormat('en-NZ',{timeZone:zone,hour:'numeric',minute:'2-digit',hour12:true}).format(new Date(ts * 1000)) : '—';
export function weather(code) {
  if (!finite(code)) return {label:'Unavailable', icon:'cloud'};
  if (code === 0) return {label:'Clear skies',icon:'sun'};
  if (code < 3) return {label:'Partly cloudy',icon:'partly'};
  if (code === 3) return {label:'Overcast',icon:'cloud'};
  if (code < 50) return {label:'Fog',icon:'fog'};
  if (code < 70) return {label:'Rain',icon:'rain'};
  if (code < 80) return {label:'Snow',icon:'snow'};
  if (code < 90) return {label:'Showers',icon:'rain'};
  return {label:'Thunderstorms',icon:'storm'};
}
export function assess(row, limits) {
  const known = ['wind','gust','wave'].every(k=>finite(row[k]));
  if (!known || !finite(row.code) || !finite(row.visibility)) return {kind:'unknown', label:'Incomplete data'};
  if (row.code >= 95) return {kind:'above', label:'Thunderstorms'};
  if (row.visibility < 1000) return {kind:'above',label:'Poor visibility'};
  if (row.wind > limits.wind || row.gust > limits.gust || row.wave > limits.wave) return {kind:'above',label:'Above your limits'};
  return {kind:'within',label:'Within your limits'};
}
export function normalise(weatherData, marineData) {
  const w=weatherData.hourly, m=marineData?.hourly;
  if (!Array.isArray(w?.time) || !w.time.length) throw new Error('Weather provider returned no hourly forecast.');
  const lookup = new Map((m?.time || []).map((t,i)=>[t,i]));
  const value = (a,k,i)=>finite(a?.[k]?.[i]) ? a[k][i] : null;
  return w.time.map((ts,i)=>{
    const j=lookup.get(ts);
    return {ts,wind:value(w,'wind_speed_10m',i),gust:value(w,'wind_gusts_10m',i),dir:value(w,'wind_direction_10m',i),temp:value(w,'temperature_2m',i),rain:value(w,'precipitation_probability',i),precip:value(w,'precipitation',i),pressure:value(w,'pressure_msl',i),visibility:value(w,'visibility',i),code:value(w,'weather_code',i),isDay:value(w,'is_day',i),wave:value(m,'wave_height',j),waveDir:value(m,'wave_direction',j),period:value(m,'wave_period',j),swell:value(m,'swell_wave_height',j),swellDir:value(m,'swell_wave_direction',j),swellPeriod:value(m,'swell_wave_period',j),water:value(m,'sea_surface_temperature',j),current:value(m,'ocean_current_velocity',j),currentDir:value(m,'ocean_current_direction',j)};
  });
}
// Supplement only explicitly allowed fields, aligned by forecast timestamp.
// Each filled value keeps its source so future comparisons can exclude it.
export function supplementRows(rows,extra,fields,source){
  const byTime=new Map(extra.map(r=>[r.ts,r]));
  return rows.map(row=>{const other=byTime.get(row.ts);if(!other)return row;const copy={...row};for(const field of fields)if(!finite(copy[field])&&finite(other[field])){copy[field]=other[field];copy.supplemented={...copy.supplemented,[field]:source};}return copy;});
}
export function tripWindows(rows, daily, limits, now = Date.now()/1000) {
  const windows=[]; let group=[];
  const flush=()=>{if(group.length>=2) windows.push({start:group[0].ts,end:group.at(-1).ts+3600,wind:Math.max(...group.map(r=>r.wind)),wave:Math.max(...group.map(r=>r.wave)),hours:group.length});group=[];};
  const daylight = (daily?.time || []).map((_,i)=>[daily.sunrise?.[i],daily.sunset?.[i]]);
  for (const r of rows) {
    const lit = daylight.some(([a,b])=>finite(a)&&finite(b)&&r.ts>=a&&r.ts+3600<=b);
    if (r.ts>=now && r.ts<now+72*3600 && lit && assess(r,limits).kind==='within') {
      if(group.length && r.ts-group.at(-1).ts!==3600) flush();
      group.push(r);
    } else flush();
  }
  flush();return windows.slice(0,4);
}
export function moonPhase(ts) {
  const days = (ts * 1000 - Date.UTC(2000,0,6,18,14)) / 86400000;
  const fraction = ((days / 29.530588853)%1+1)%1;
  const names=['New moon','Waxing crescent','First quarter','Waxing gibbous','Full moon','Waning gibbous','Last quarter','Waning crescent'];
  return {label:names[Math.round(fraction*8)%8], illumination:Math.round((1-Math.cos(2*Math.PI*fraction))/2*100)};
}
