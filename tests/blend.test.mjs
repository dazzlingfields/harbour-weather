import test from 'node:test';
import assert from 'node:assert/strict';
import {blendRows,confidenceLevel} from '../dist/blend.js';
import {assess,tripWindows} from '../dist/forecast.js';
import {fetchForecast,forecastURLs} from '../dist/api.js';
import {forecastCacheKey} from '../dist/storage.js';
const now=1800000000,good={ts:now,wind:10,gust:15,dir:0,wave:.5,waveDir:0,period:4,code:1,visibility:15000};
const member=(id,row)=>({id,rows:[{...good,...row}]});
const blend=members=>blendRows(members,{now})[0];
test('blend is the default, including invalid saved selections, with its own cache identity',()=>{
  const urls=forecastURLs({lat:-36.75,lon:175.05},{});
  assert.equal(urls.weather.searchParams.get('models'),'ecmwf_ifs,gfs_global,icon_global');
  assert.equal(urls.marine.searchParams.get('models'),'ecmwf_wam,ncep_gfswave025,meteofrance_wave');
  assert.notEqual(forecastCacheKey({lat:-36,lon:175},{}),forecastCacheKey({lat:-36,lon:175},{weather:'best_match',wave:'best_match'}));
});
test('circular directions cross north correctly without cancelling scalar wind speed',()=>{
  const north=blend([member('a',{dir:350}),member('b',{dir:10}),member('c',{dir:0})]);
  assert.ok(north.dir<1||north.dir>359);assert.equal(north.wind,10);
  const opposing=blend([member('a',{dir:90}),member('b',{dir:270})]);
  assert.equal(opposing.dir,null);assert.equal(opposing.wind,10);assert.ok(opposing.blend.score<50);
});
test('missing values are excluded and supplementary sources never become extra model votes',()=>{
  const row=blend([member('a',{wind:12}),member('b',{wind:null}),member('c',{wind:30,supplemented:{wind:'best_match'}})]);
  assert.equal(row.wind,12);assert.equal(row.blend.fields.wind.count,1);assert.ok(row.blend.score<=35);
  const absent=blend([member('a',{wave:null}),member('b',{wave:null})]);assert.equal(absent.wave,null);assert.equal(absent.blend.score,null);assert.equal(confidenceLevel(null),'Unavailable');
});
test('agreement, member coverage and forecast lead time reduce confidence without ever claiming 100%',()=>{
  const close=blend(['a','b','c'].map(id=>member(id,{})));
  const wide=blend([member('a',{wind:5}),member('b',{wind:15}),member('c',{wind:30})]);
  const far=blendRows(['a','b','c'].map(id=>member(id,{ts:now+144*3600})),{now})[0];
  assert.ok(close.blend.score<100);assert.ok(wide.blend.score<close.blend.score);assert.ok(far.blend.score<close.blend.score);
  assert.ok(blend([member('a',{}),member('b',{})]).blend.score<close.blend.score);
});
test('outliers retain their upper range, and trip checks cannot average away a hazardous member',()=>{
  const row=blend([member('a',{wind:8}),member('b',{wind:10}),member('c',{wind:35})]);
  assert.ok(row.wind<18);assert.equal(row.blend.fields.wind.max,35);
  assert.equal(assess(row,{wind:20,gust:40,wave:2}).kind,'above');
  const low={...good,blend:{score:35,fields:{}}};assert.equal(assess(low,{wind:20,gust:40,wave:2}).kind,'unknown');
  assert.equal(tripWindows([{...row,ts:now},{...row,ts:now+3600}],{time:[now],sunrise:[now],sunset:[now+10000]},{wind:20,gust:40,wave:2},now).length,0);
});
test('weather codes remain categorical and storm and poor visibility signals survive blending',()=>{
  const row=blend([member('a',{code:1}),member('b',{code:3}),member('c',{code:95,visibility:500})]);assert.equal(row.code,95);assert.equal(row.visibility,500);
});
function payload(url){
  const ids=url.searchParams.get('models').split(','),marine=url.hostname.startsWith('marine-'),hourly={time:[now,now+3600]},daily={time:[now]};
  const fields=marine?{wave_height:.6,wave_direction:0,wave_period:4,swell_wave_height:.3,swell_wave_direction:0,swell_wave_period:6,sea_surface_temperature:16,ocean_current_velocity:.4,ocean_current_direction:30}:{wind_speed_10m:10,wind_gusts_10m:15,wind_direction_10m:0,temperature_2m:17,precipitation_probability:20,precipitation:0,weather_code:1,pressure_msl:1010,visibility:15000,is_day:1};
  for(const id of ids)for(const [k,v]of Object.entries(fields))hourly[k+(ids.length>1?'_'+id:'')]=[v,v];
  for(const id of ids)for(const [k,v]of Object.entries({sunrise:now-3600,sunset:now+36000,uv_index_max:5,temperature_2m_max:20,temperature_2m_min:12}))daily[k+(ids.length>1?'_'+id:'')]=[v];
  return {hourly,daily,latitude:-36.75,longitude:175.05,timezone:'Pacific/Auckland'};
}
test('live API pipeline splits suffixed members and keeps weather/marine identities separate',async t=>{
  t.mock.method(globalThis,'fetch',async url=>new Response(JSON.stringify(payload(new URL(url)))));
  const data=await fetchForecast({lat:-36.75,lon:175.05},new AbortController().signal,{});
  assert.equal(data.schemaVersion,4);assert.equal(data.rows.length,2);assert.equal(data.rows[0].wind,10);assert.equal(data.rows[0].wave,.6);assert.equal(data.rows[0].blend.fields.wind.count,3);assert.equal(data.rows[0].blend.fields.wave.count,3);assert.equal(data.sources.weatherMembers.length,3);assert.equal(data.sources.waveMembers.length,3);assert.equal(data.daily.sunrise[0],now-3600);
});
test('failed batch retries members and reduces confidence when only one succeeds',async t=>{
  t.mock.method(globalThis,'fetch',async input=>{const url=new URL(input),ids=url.searchParams.get('models');if(ids.includes(',')||!['ecmwf_ifs','ecmwf_wam','best_match'].includes(ids))return new Response('{}',{status:503});return new Response(JSON.stringify(payload(url)));});
  const data=await fetchForecast({lat:-36.75,lon:175.05},new AbortController().signal,{});assert.equal(data.sources.weatherMembers.length,1);assert.equal(data.sources.waveMembers.length,1);assert.ok(data.rows[0].blend.score<=35);assert.equal(data.rows[0].wind,10);
});
test('marine outage preserves weather and never silently substitutes waves or invents confidence',async t=>{
  t.mock.method(globalThis,'fetch',async input=>{const url=new URL(input);return url.hostname.startsWith('marine-')?new Response('{}',{status:503}):new Response(JSON.stringify(payload(url)));});
  const data=await fetchForecast({lat:-36.75,lon:175.05},new AbortController().signal,{});assert.equal(data.marineAvailable,false);assert.equal(data.rows[0].wave,null);assert.equal(data.rows[0].blend.score,null);assert.equal(data.rows[0].wind,10);
});
test('rate limits do not fan out retries, and cancellation propagates',async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response('{}',{status:429});});
  await assert.rejects(fetchForecast({lat:-36.75,lon:175.05},new AbortController().signal,{}),/limit reached/);assert.equal(calls,2);
  await assert.rejects(fetchForecast({lat:-36.75,lon:175.05},AbortSignal.abort(),{}),{name:'AbortError'});
});
test('mixing one explicit model with a blend does not count the explicit source as ensemble agreement',async t=>{
  t.mock.method(globalThis,'fetch',async input=>new Response(JSON.stringify(payload(new URL(input)))));
  const data=await fetchForecast({lat:-36.75,lon:175.05},new AbortController().signal,{weather:'gfs_global',wave:'blend'});assert.equal(data.rows[0].wind,10);assert.equal(data.rows[0].blend.fields.wind,undefined);assert.equal(data.rows[0].blend.fields.wave.count,3);assert.equal(data.sources.expectedWeather,1);
});
