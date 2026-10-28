// Download published LINZ high/low water tables. No inferred offshore tide model.
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const ports=['Auckland','Marsden Point','Opua','Whitianga','Tauranga','Gisborne','Napier','Wellington','Picton','Nelson','Westport','Port Taranaki','Onehunga','Lyttelton','Akaroa','Timaru','Port Chalmers','Bluff'];
const years=process.argv.slice(2).length?process.argv.slice(2).map(Number):[2026,2027];
const root=fileURLToPath(new URL('../dist/data/',import.meta.url));await mkdir(root,{recursive:true});
const formatter=new Intl.DateTimeFormat('en-GB',{timeZone:'Pacific/Auckland',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
export function localEpoch(y,m,d,time){const [h,minute]=time.split(':').map(Number);const target=Date.UTC(y,m-1,d,h,minute);let epoch=target;for(let i=0;i<4;i++){const p=Object.fromEntries(formatter.formatToParts(new Date(epoch)).filter(x=>x.type!=='literal').map(x=>[x.type,Number(x.value)]));const actual=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);const delta=target-actual;epoch+=delta;if(!delta)break;}return epoch/1000;}
const coord=s=>{const m=s.match(/(\d+)[°º](\d+(?:\.\d+)?)[′']?\s*([NSEW])/);if(!m)throw Error('Unrecognised coordinate: '+s);return (Number(m[1])+Number(m[2])/60)*('SW'.includes(m[3])?-1:1);};
const index={provider:'Toitū Te Whenua Land Information New Zealand (LINZ)',licence:'CC BY 4.0',retrieved:new Date().toISOString(),years,stations:[]};
for(const name of ports){
  let station;
  for(const year of years){
    const url=`https://static.charts.linz.govt.nz/tide-tables/maj-ports/csv/${encodeURIComponent(name+' '+year)}.csv`;
    const response=await fetch(url);if(!response.ok)throw Error(`${name} ${year}: ${response.status}`);
    const csv=await response.text();const lines=csv.trim().split(/\r?\n/),head=lines[0].split(',');
    station??={name:head[1].trim(),id:name.toLowerCase().replaceAll(' ','-'),lat:coord(head[2]),lon:coord(head[3]),files:{}};
    const events=[];
    for(const line of lines.slice(3)){const row=line.split(',');if(!/^\d+$/.test(row[0]))continue;for(let i=4;i<row.length;i+=2){if(!/^\d\d:\d\d$/.test(row[i])||row[i+1]==='')continue;events.push([localEpoch(Number(row[3]),Number(row[2]),Number(row[0]),row[i]),Number(row[i+1])]);}}
    const pair=events.findIndex((r,i)=>i<events.length-1&&r[1]!==events[i+1][1]);if(pair<0)throw Error('Cannot classify tidal extrema');
    const pairIsHigh=events[pair][1]>events[pair+1][1];
    events.forEach((r,i)=>r.push((i%2===pair%2)===pairIsHigh?'H':'L'));
    if(events.length<1300||events.some((r,i)=>i&&r[0]<=events[i-1][0]))throw Error(`Invalid tide sequence: ${name} ${year}`);
    const file=`${station.id}-${year}.json`;
    await writeFile(root+file,JSON.stringify({station:station.name,year,source:url,reference:lines[1],timeZone:'Pacific/Auckland',datum:'Chart datum',events}));
    station.files[year]=file;
    console.log(`${station.name} ${year}: ${events.length} high/low events`);
  }
  index.stations.push(station);
}
await writeFile(root+'tides-index.json',JSON.stringify(index));
