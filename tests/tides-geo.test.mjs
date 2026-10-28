import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dateKey,clock} from '../dist/forecast.js';
import {distanceKm,bearing,nearestStation} from '../dist/geo.js';
const index=JSON.parse(await readFile(new URL('../dist/data/tides-index.json',import.meta.url)));
test('all bundled port predictions are ordered, cover their year and alternate high/low',async()=>{
  assert.equal(index.stations.length,18);
  for(const station of index.stations){
    for(const [year,file] of Object.entries(station.files)){
      const data=JSON.parse(await readFile(new URL('../dist/data/'+file,import.meta.url)));
      assert.ok(data.events.length>1300);assert.ok(data.source.startsWith('https://static.charts.linz.govt.nz/'));
      for(const [i,event] of data.events.entries()){
        assert.ok(Number.isFinite(event[0])&&Number.isFinite(event[1]));assert.equal(dateKey(event[0]).slice(0,4),year);
        if(i){assert.ok(event[0]>data.events[i-1][0]);assert.notEqual(event[2],data.events[i-1][2]);}
      }
    }
  }
});
test('Auckland sample matches the published 28 October 2026 CSV including NZDT',async()=>{
  const data=JSON.parse(await readFile(new URL('../dist/data/auckland-2026.json',import.meta.url)));
  const events=data.events.filter(e=>dateKey(e[0])==='2026-10-28');
  assert.deepEqual(events.map(e=>[clock(e[0]),e[1],e[2]]),[['3:11 am',.3,'L'],['9:34 am',3.4,'H'],['3:33 pm',.5,'L'],['9:55 pm',3.3,'H']]);
});
test('distance and bearing use nautical distance correctly',()=>{
  assert.ok(Math.abs(distanceKm({lat:0,lon:0},{lat:1/60,lon:0})/1.852-1)<.002);
  assert.equal(bearing({lat:0,lon:0},{lat:0,lon:1}),90);
  assert.equal(distanceKm({lat:-36,lon:175},{lat:-36,lon:175}),0);
  assert.equal(nearestStation({lat:-36.85,lon:174.77},index.stations).name,'Auckland');
});
