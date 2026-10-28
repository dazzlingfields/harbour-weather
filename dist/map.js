import {SPOTS} from './api.js';
import {read,write} from './storage.js';
import {distanceKm,bearing,validNZ} from './geo.js';
const $=s=>document.querySelector(s);
let map,selected,selectionMarker,forecastMarker,marksLayer,measureLayer,measureStart,measuring=false,onForecast,marks=read('marks',[]),editingId=null,toast;
const textIcon=(label,color)=>window.L.divIcon({className:'map-point',html:`<span style="background:${color}">${label}</span>`,iconSize:[26,26],iconAnchor:[13,13]});
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function choose(spot,id=null){selected=spot;editingId=id;$('#mark-name').value=id?spot.name:'';$('#mark-notes').value=spot.notes||'';$('#map-lat').value=spot.lat.toFixed(5);$('#map-lon').value=spot.lon.toFixed(5);$('#map-selected').textContent=`${spot.lat.toFixed(5)}, ${spot.lon.toFixed(5)}`;$('#map-save').textContent=id?'Update mark':'Save mark';$('#map-delete').hidden=!id;if(selectionMarker)selectionMarker.remove();selectionMarker=window.L.marker([spot.lat,spot.lon],{icon:textIcon('+','#c48632'),keyboard:false}).addTo(map);}
function renderMarks(){
  marksLayer.clearLayers();
  marks.forEach((s,i)=>window.L.marker([s.lat,s.lon],{icon:textIcon(String(i+1),'#286f64'),title:s.name}).addTo(marksLayer).on('click',()=>{choose(s,s.id);map.panTo([s.lat,s.lon]);}));
  $('#map-marks').innerHTML=marks.length?marks.map((s,i)=>`<button class="saved-mark" data-mark="${esc(s.id)}"><span>${i+1}</span><div><strong>${esc(s.name)}</strong><small>${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}</small></div><span>↗</span></button>`).join(''):'<p class="section-note">No saved marks.</p>';
}
function persist(){if(!write('marks',marks))toast('Storage unavailable. Export your marks before leaving.');renderMarks();}
export function openMap(spot,forecastHandler,notify){
  onForecast=forecastHandler;toast=notify;
  if(!window.L){$('#marine-map').textContent='Map library unavailable. Refresh to retry.';return;}
  if(!map){
    map=window.L.map('marine-map',{zoomControl:true,minZoom:5,maxZoom:18,maxBounds:[[-50,164],[-32,181]],maxBoundsViscosity:.6}).setView([spot.lat,spot.lon],9);
    window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'}).addTo(map).on('tileerror',()=>{$('#map-status').textContent='Base map unavailable. Coordinates and saved marks still work.';});
    const seamarks=window.L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png',{maxNativeZoom:18,maxZoom:18,attribution:'Seamarks © <a href="https://www.openseamap.org/" target="_blank" rel="noopener">OpenSeaMap</a>'}).addTo(map);
    seamarks.on('tileerror',()=>{$('#map-status').textContent='Some marine symbols could not load.';});
    $('#seamarks-toggle').addEventListener('change',e=>e.target.checked?seamarks.addTo(map):map.removeLayer(seamarks));
    window.L.control.scale({imperial:false}).addTo(map);marksLayer=window.L.layerGroup().addTo(map);measureLayer=window.L.layerGroup().addTo(map);
    SPOTS.forEach(s=>window.L.circleMarker([s.lat,s.lon],{radius:5,color:'#215e67',weight:2,fillColor:'#fff',fillOpacity:1}).addTo(map).bindTooltip(s.name).on('click',e=>{window.L.DomEvent.stopPropagation(e);choose(s);}));
    map.on('click',e=>{
      const p={lat:e.latlng.lat,lon:e.latlng.lng,name:'Map spot',area:'New Zealand'};
      if(!validNZ(p.lat,p.lon)){toast('Select a point in New Zealand coastal waters.');return;}
      if(measuring){if(!measureStart){measureStart=p;measureLayer.clearLayers();window.L.circleMarker([p.lat,p.lon],{radius:5,color:'#b76c25'}).addTo(measureLayer);$('#map-measure-result').textContent='Select the second point.';}else{const nm=distanceKm(measureStart,p)/1.852,deg=bearing(measureStart,p);window.L.polyline([[measureStart.lat,measureStart.lon],[p.lat,p.lon]],{color:'#b76c25',dashArray:'5 6'}).addTo(measureLayer);$('#map-measure-result').textContent=`${nm.toFixed(2)} nm · initial bearing ${Math.round(deg)}° true`;measureStart=null;}}else choose(p);
    });
    $('#map-centre').addEventListener('click',()=>{const p=map.getCenter();choose({lat:p.lat,lon:p.lng,name:'Map spot',area:'New Zealand'});});
    $('#map-home').addEventListener('click',()=>map.fitBounds([[-47.5,166],[-34,179]]));
    $('#map-measure').addEventListener('click',e=>{measuring=!measuring;measureStart=null;measureLayer.clearLayers();e.target.setAttribute('aria-pressed',String(measuring));$('#map-measure-result').textContent=measuring?'Select two points. Straight-line measurement only.':'';});
    $('#map-coordinates').addEventListener('submit',e=>{e.preventDefault();const lat=Number($('#map-lat').value),lon=Number($('#map-lon').value);if(!validNZ(lat,lon)){toast('Use New Zealand coordinates: 33–49°S, 165–180°E.');return;}choose({lat,lon,name:'Map spot',area:'New Zealand'});map.setView([lat,lon],Math.max(9,map.getZoom()));});
    $('#map-forecast').addEventListener('click',()=>{if(selected)onForecast({...selected,name:$('#mark-name').value.trim()||selected.name,area:'New Zealand'});});
    $('#mark-form').addEventListener('submit',e=>{e.preventDefault();if(!selected)return;const mark={id:editingId||crypto.randomUUID(),lat:selected.lat,lon:selected.lon,name:$('#mark-name').value.trim(),notes:$('#mark-notes').value.trim(),area:'New Zealand'};if(editingId)marks=marks.map(m=>m.id===editingId?mark:m);else marks.push(mark);persist();choose(mark,mark.id);toast('Mark saved on this device');});
    $('#map-delete').addEventListener('click',()=>{const removed=marks.find(m=>m.id===editingId);marks=marks.filter(m=>m.id!==editingId);persist();if(removed)choose(removed);toast('Mark removed');});
    $('#map-marks').addEventListener('click',e=>{const b=e.target.closest('[data-mark]');const mark=marks.find(m=>m.id===b?.dataset.mark);if(mark){choose(mark,mark.id);map.setView([mark.lat,mark.lon],Math.max(10,map.getZoom()));}});
    $('#marks-export').addEventListener('click',async()=>{const data=JSON.stringify({type:'FeatureCollection',features:marks.map(m=>({type:'Feature',geometry:{type:'Point',coordinates:[m.lon,m.lat]},properties:{name:m.name,notes:m.notes}}))},null,2);if(window.Capacitor?.isNativePlatform?.()){try{await navigator.clipboard.writeText(data);toast('Marks copied as GeoJSON');}catch{$('#marks-data').value=data;$('#marks-data').hidden=false;toast('Select and copy the GeoJSON below');}return;}const url=URL.createObjectURL(new Blob([data],{type:'application/geo+json'}));const a=document.createElement('a');a.href=url;a.download='harbour-marks.geojson';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
    $('#marks-import').addEventListener('change',async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>500000)throw Error('File too large');const json=JSON.parse(await file.text());if(json.type!=='FeatureCollection'||!Array.isArray(json.features))throw Error('Use a GeoJSON FeatureCollection');const incoming=json.features.map(f=>{const [lon,lat]=f.geometry?.coordinates||[];if(f.geometry?.type!=='Point'||!validNZ(lat,lon))throw Error('Only New Zealand point markers are supported');return{id:crypto.randomUUID(),lat,lon,name:String(f.properties?.name||'Imported mark').slice(0,60),notes:String(f.properties?.notes||'').slice(0,500),area:'New Zealand'};});if(marks.length+incoming.length>500)throw Error('Maximum 500 marks');marks.push(...incoming);persist();toast(`Imported ${incoming.length} marks`);}catch(err){toast(err.message);}e.target.value='';});
  }
  if(forecastMarker)forecastMarker.remove();forecastMarker=window.L.circleMarker([spot.lat,spot.lon],{radius:11,color:'#265a6b',weight:2,fill:false}).addTo(map).bindTooltip('Forecast: '+esc(spot.name));
  map.invalidateSize();choose(spot);map.panTo([spot.lat,spot.lon]);renderMarks();
}
