import {nearestStation,distanceKm} from './geo.js';
import {read,write,locationKey} from './storage.js';
import {dateKey,clock,number} from './forecast.js';
let indexPromise,loadId=0,currentSpot,currentEvents=[],station,selectedDay;
const $=s=>document.querySelector(s);
export async function tideIndex(){return indexPromise??=fetch('./data/tides-index.json').then(r=>{if(!r.ok)throw Error('Tide index unavailable');return r.json();}).catch(e=>{indexPromise=null;throw e;});}
const dayName=key=>new Intl.DateTimeFormat('en-NZ',{timeZone:'UTC',weekday:'short',day:'numeric',month:'short'}).format(new Date(key+'T12:00:00Z'));
export function renderTides(){
  if(!station)return;
  const now=Date.now()/1000,next=currentEvents.find(e=>e[0]>=now),distance=Math.round(distanceKm(currentSpot,station));
  $('#tide-port-note').textContent=`${station.name} port · ${distance} km from forecast spot. Local tides can differ.`;
  $('#tide-next').innerHTML=next?`<span>Next ${next[2]==='H'?'high':'low'} · ${station.name}</span><strong>${clock(next[0])} <small>${number(next[1],1)} m</small></strong>`:'<span>No current tide table</span><strong>Refresh data</strong>';
  const start=Date.now()/1000;const days=Array.from({length:7},(_,i)=>dateKey(start+i*86400));
  if(!days.includes(selectedDay))selectedDay=days[0];
  $('#tide-day').innerHTML=days.map(d=>`<option value="${d}"${d===selectedDay?' selected':''}>${dayName(d)}</option>`).join('');
  const events=currentEvents.filter(e=>dateKey(e[0])===selectedDay);
  $('#tide-events').innerHTML=events.length?events.map(e=>`<div class="tide-event ${e[2]==='H'?'high':'low'}"><span>${e[2]==='H'?'↟ High':'↡ Low'}</span><strong>${clock(e[0])}</strong><b>${number(e[1],1)} <small>m</small></b></div>`).join(''):'<p class="empty-state">No published predictions for this date.</p>';
  $('#tide-source').href=station.files?.[Number(selectedDay.slice(0,4))]?`https://static.charts.linz.govt.nz/tide-tables/maj-ports/csv/${encodeURIComponent(station.name+' '+selectedDay.slice(0,4))}.csv`:'https://www.linz.govt.nz/products-services/tides-and-tidal-streams/tide-predictions';
}
async function selectStation(id){
  const request=++loadId;$('#tide-events').innerHTML='<p class="empty-state">Loading tide table…</p>';
  try{const index=await tideIndex();const candidate=index.stations.find(s=>s.id===id)||nearestStation(currentSpot,index.stations);const year=Number(dateKey(Date.now()/1000).slice(0,4));const years=[year,year+1].filter(y=>candidate.files[y]);const results=await Promise.all(years.map(y=>fetch('./data/'+candidate.files[y]).then(r=>{if(!r.ok)throw Error('Tide table unavailable');return r.json();})));if(request!==loadId)return;station=candidate;currentEvents=results.flatMap(d=>d.events).sort((a,b)=>a[0]-b[0]);$('#tide-station').value=station.id;renderTides();}
  catch{if(request===loadId){station=null;$('#tide-events').innerHTML='<p class="empty-state">Tide table unavailable. Use LINZ predictions below.</p>';$('#tide-next').innerHTML='<span>Tide table unavailable</span><strong>Check LINZ</strong>';}}
}
export async function loadTides(spot){currentSpot=spot;selectedDay=null;const request=++loadId;station=null;$('#tide-next').innerHTML='<span>Tides</span><strong>Loading…</strong>';try{const index=await tideIndex();if(request!==loadId)return;$('#tide-station').innerHTML=index.stations.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');await selectStation(read('tide-station:'+locationKey(spot),null)||nearestStation(spot,index.stations).id);}catch{if(request===loadId)$('#tide-events').innerHTML='<p class="empty-state">Tide table unavailable. Use LINZ below.</p>';}}
$('#tide-station').addEventListener('change',e=>{write('tide-station:'+locationKey(currentSpot),e.target.value);selectStation(e.target.value);});
$('#tide-day').addEventListener('change',e=>{selectedDay=e.target.value;renderTides();});
