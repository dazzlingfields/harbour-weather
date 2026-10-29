import {SPOTS} from './api.js';
import {read,write,locationKey} from './storage.js';
import {distanceKm,bearing,validNZ} from './geo.js';
import {initMapForecast,showMapForecast,syncMapForecast} from './map-forecast.js';
import {quantity,displayValue,unitLabel,canonicalValue} from './units.js';
import {DEFAULT_CHART_RELAY} from './config.js';
import {referenceChart,connectLinz} from './charts.js';
const $=s=>document.querySelector(s);
let onSelect,map,selected,selectionMarker,forecastMarker,marksLayer,measureLayer,measureStart,measuring=false,onForecast,marks=read('marks',[]),editingId=null,toast;
let reference,linz,chartMode='charts',lastForecastKey,connecting=false,initialConnection=true;
const chartStatus=message=>{$('#map-status').textContent=message;};
function panel(open){$('#map-sidebar').classList.toggle('is-open',open);$('#map-sidebar').inert=!open;$('#map-panel-toggle').setAttribute('aria-expanded',String(open));}
async function changeChart(mode){
  if(mode==='linz'&&!linz){
    $('#map-layer').value=chartMode;
    const key=read('chart-relay',DEFAULT_CHART_RELAY);
    if(!key){$('#chart-dialog').showModal();return;}
    if(connecting)return;connecting=true;chartStatus('Connecting to LINZ…');
    try{linz=await connectLinz(map,key,chartStatus);}catch(error){$('#linz-status').textContent=error.message;$('#chart-dialog').showModal();return;}finally{connecting=false;}
  }
  chartMode=mode;$('#map-layer').value=mode;reference.hide();linz?.hide();
  if(mode==='charts')reference.show();else if(mode==='linz')linz.show();else chartStatus('Coast map · no depth chart');
}
const textIcon=(label,color)=>window.L.divIcon({className:'map-point',html:`<span style="background:${color}">${label}</span>`,iconSize:[44,44],iconAnchor:[22,22]});
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function choose(spot,id=null){$('#map-tools').open=false;onSelect?.(spot);selected=spot;editingId=id;$('#mark-name').value=id?spot.name:'';$('#mark-notes').value=spot.notes||'';$('#map-lat').value=spot.lat.toFixed(5);$('#map-lon').value=spot.lon.toFixed(5);$('#map-selected').textContent=`${spot.lat.toFixed(5)}, ${spot.lon.toFixed(5)}`;$('#map-save').textContent=id?'Update mark':'Save mark';$('#map-delete').hidden=!id;if(selectionMarker)selectionMarker.remove();selectionMarker=window.L.marker([spot.lat,spot.lon],{icon:textIcon('+','#c48632'),keyboard:false}).addTo(map);showMapForecast(spot);requestAnimationFrame(()=>{if(selected!==spot)return;const height=document.querySelector('#map-weather').getBoundingClientRect().height;map.panInside([spot.lat,spot.lon],{paddingTopLeft:[15,95],paddingBottomRight:[15,Math.min(height+38,map.getSize().y*.65)],animate:false});});}
function renderMarks(){
  marksLayer.clearLayers();
  marks.forEach((s,i)=>window.L.marker([s.lat,s.lon],{icon:textIcon(String(i+1),'#286f64'),title:s.name}).addTo(marksLayer).on('click',()=>{choose(s,s.id);map.panTo([s.lat,s.lon]);panel(false);}));
  const query=$('#marks-search').value.trim().toLowerCase();const visible=marks.filter(s=>(s.name+' '+s.notes).toLowerCase().includes(query));$('#marks-count').textContent=`Saved locations (${marks.length})`;$('#map-panel-toggle').textContent=`Saved (${marks.length})`;
  $('#map-marks').innerHTML=visible.length?visible.map((s,i)=>`<button class="saved-mark" data-mark="${esc(s.id)}"><span>${i+1}</span><div><strong>${esc(s.name)}</strong><small>${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}</small></div><span>↗</span></button>`).join(''):'<p class="section-note">'+(marks.length?'No matches.':'Tap the map, then Save / edit.')+'</p>';
}
function persist(){if(!write('marks',marks))toast('Storage unavailable. Export your marks before leaving.');renderMarks();}
export function openMap(spot,forecastHandler,notify,selectionHandler){
  onForecast=forecastHandler;toast=notify;onSelect=selectionHandler;
  if(!window.L){$('#marine-map').textContent='Map library unavailable. Refresh to retry.';return;}
  if(!map){
    map=window.L.map('marine-map',{zoomControl:true,minZoom:5,maxZoom:18,maxBounds:[[-50,164],[-32,181]],maxBoundsViscosity:.6}).setView([spot.lat,spot.lon],11);
    window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'}).addTo(map).on('tileerror',()=>{$('#map-status').textContent='Base map unavailable. Coordinates and saved marks still work.';});
    const seamarks=window.L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png',{maxNativeZoom:18,maxZoom:18,attribution:'Seamarks © <a href="https://www.openseamap.org/" target="_blank" rel="noopener">OpenSeaMap</a>'});
    seamarks.on('tileerror',()=>{$('#map-status').textContent='Some marine symbols could not load.';});
    $('#seamarks-toggle').addEventListener('change',e=>e.target.checked?seamarks.addTo(map):map.removeLayer(seamarks));
    reference=referenceChart(map,chartStatus);reference.show();
    $('#map-layer').append(new Option('Show Hauraki chart area','coverage'));
    $('#map-layer').addEventListener('change',e=>{if(e.target.value==='coverage'){changeChart('charts');reference.fit();}else changeChart(e.target.value);});
    $('#map-chart-area').addEventListener('click',()=>{changeChart('charts');reference.fit();});
    $('#map-find').addEventListener('click',()=>$('#location-button').click());
    $('#map-connection').addEventListener('click',()=>{$('#chart-url').value=read('chart-relay',DEFAULT_CHART_RELAY);$('#chart-dialog').showModal();});
    $('#map-tools').addEventListener('click',e=>{if(e.target.closest('button'))$('#map-tools').open=false;});
    $('#map-panel-toggle').addEventListener('click',()=>panel(!$('#map-sidebar').classList.contains('is-open')));
    $('#map-panel-close').addEventListener('click',()=>{panel(false);$('#map-panel-toggle').focus();});
    $('#map-sidebar').addEventListener('keydown',e=>{if(e.key==='Escape'){$('#map-panel-close').click();e.stopPropagation();}});
    initMapForecast(()=>{panel(true);$('#mark-name').focus();},p=>onForecast(p));
    $('#marks-search').addEventListener('input',renderMarks);
    $('#map-popular').append(...SPOTS.map((s,i)=>new Option(s.name,String(i))));
    $('#map-popular').addEventListener('change',e=>{const s=SPOTS[Number(e.target.value)];if(e.target.value!==''&&s){choose(s);map.setView([s.lat,s.lon],10);panel(false);}e.target.value='';});
    write('linz-key',null); // Remove keys saved by earlier versions; connections now use a relay.
    $('#chart-url').value=read('chart-relay',DEFAULT_CHART_RELAY);
    map.getContainer().addEventListener('keydown',e=>{if(e.key==='Escape')panel(false);});
    new ResizeObserver(()=>map.invalidateSize()).observe($('#marine-map'));
    $('#linz-form').addEventListener('submit',async e=>{
      e.preventDefault();if(connecting)return;connecting=true;$('#linz-status').textContent='Connecting…';
      try{const key=$('#chart-url').value.trim();const connection=await connectLinz(map,key,chartStatus);linz?.destroy();linz=connection;write('chart-relay',key);$('#chart-dialog').close();await changeChart('linz');}
      catch(error){$('#linz-status').textContent=error.message;}
      finally{connecting=false;}
    });
    $('#linz-forget').addEventListener('click',()=>{write('chart-relay',null);linz?.destroy();linz=null;$('#chart-url').value=DEFAULT_CHART_RELAY;$('#linz-status').textContent='Default connection selected.';changeChart(DEFAULT_CHART_RELAY?'linz':'charts');});
    const scale=window.L.control({position:'bottomleft'});let scaleNode;scale.onAdd=()=>{scaleNode=window.L.DomUtil.create('div','map-scale');return scaleNode;};scale.addTo(map);const updateScale=()=>{const settings=read('settings',{}),size=map.getSize(),km=map.distance(map.containerPointToLatLng([0,size.y/2]),map.containerPointToLatLng([90,size.y/2]))/1000,raw=displayValue(km,'distance',settings);if(!raw||!scaleNode)return;const power=10**Math.floor(Math.log10(raw)),n=[1,2,5,10].filter(n=>n*power<=raw).at(-1)||1,value=n*power;scaleNode.style.width=Math.max(25,90*value/raw)+'px';scaleNode.textContent=value+' '+unitLabel('distance',settings);};map.on('moveend zoomend resize',updateScale);document.addEventListener('preferences-change',updateScale);updateScale();marksLayer=window.L.layerGroup().addTo(map);measureLayer=window.L.layerGroup().addTo(map);
    SPOTS.forEach(s=>window.L.circleMarker([s.lat,s.lon],{radius:5,color:'#215e67',weight:2,fillColor:'#fff',fillOpacity:1}).addTo(map).bindTooltip(s.name).on('click',e=>{window.L.DomEvent.stopPropagation(e);choose(s);}));
    map.on('click',e=>{
      const p={lat:e.latlng.lat,lon:e.latlng.lng,name:'Map spot',area:'New Zealand'};
      if(!validNZ(p.lat,p.lon)){toast('Select a point in New Zealand coastal waters.');return;}
      if(measuring){if(!measureStart){measureStart=p;measureLayer.clearLayers();window.L.circleMarker([p.lat,p.lon],{radius:5,color:'#b76c25'}).addTo(measureLayer);$('#map-measure-result').textContent='Select the second point.';}else{const km=distanceKm(measureStart,p),deg=bearing(measureStart,p);window.L.polyline([[measureStart.lat,measureStart.lon],[p.lat,p.lon]],{color:'#b76c25',dashArray:'5 6'}).addTo(measureLayer);$('#map-measure-result').textContent=`${quantity(km,'distance',read('settings',{}),2)} · initial bearing ${Math.round(deg)}° true`;measureStart=null;}}else choose(p);
    });
    $('#map-centre').addEventListener('click',()=>{const p=map.getCenter();choose({lat:p.lat,lon:p.lng,name:'Map spot',area:'New Zealand'});});
    $('#map-home').addEventListener('click',()=>map.fitBounds([[-47.5,166],[-34,179]]));
    $('#map-measure').addEventListener('click',e=>{measuring=!measuring;measureStart=null;measureLayer.clearLayers();e.target.setAttribute('aria-pressed',String(measuring));$('#map-measure-result').textContent=measuring?'Select two points. Straight-line measurement only.':'';});
    $('#map-coordinates').addEventListener('submit',e=>{e.preventDefault();const lat=Number($('#map-lat').value),lon=Number($('#map-lon').value);if(!validNZ(lat,lon)){toast('Use New Zealand coordinates: 33–49°S, 165–180°E.');return;}choose({lat,lon,name:'Map spot',area:'New Zealand'});map.setView([lat,lon],Math.max(9,map.getZoom()));});
    $('#map-forecast').addEventListener('click',()=>{if(selected)showMapForecast(selected);panel(false);});
    $('#mark-form').addEventListener('submit',e=>{e.preventDefault();if(!selected)return;const mark={id:editingId||crypto.randomUUID(),lat:selected.lat,lon:selected.lon,name:$('#mark-name').value.trim(),notes:$('#mark-notes').value.trim(),area:'New Zealand'};if(editingId)marks=marks.map(m=>m.id===editingId?mark:m);else marks.push(mark);persist();choose(mark,mark.id);toast('Mark saved on this device');});
    $('#map-delete').addEventListener('click',()=>{const removed=marks.find(m=>m.id===editingId);marks=marks.filter(m=>m.id!==editingId);persist();if(removed)choose(removed);toast('Mark removed');});
    $('#map-marks').addEventListener('click',e=>{const b=e.target.closest('[data-mark]');const mark=marks.find(m=>m.id===b?.dataset.mark);if(mark){choose(mark,mark.id);map.setView([mark.lat,mark.lon],Math.max(10,map.getZoom()));panel(false);}});
    $('#marks-export').addEventListener('click',async()=>{const data=JSON.stringify({type:'FeatureCollection',features:marks.map(m=>({type:'Feature',geometry:{type:'Point',coordinates:[m.lon,m.lat]},properties:{name:m.name,notes:m.notes}}))},null,2);if(window.Capacitor?.isNativePlatform?.()){try{await navigator.clipboard.writeText(data);toast('Marks copied as GeoJSON');}catch{$('#marks-data').value=data;$('#marks-data').hidden=false;toast('Select and copy the GeoJSON below');}return;}const url=URL.createObjectURL(new Blob([data],{type:'application/geo+json'}));const a=document.createElement('a');a.href=url;a.download='harbour-marks.geojson';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
    $('#marks-import').addEventListener('change',async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>500000)throw Error('File too large');const json=JSON.parse(await file.text());if(json.type!=='FeatureCollection'||!Array.isArray(json.features))throw Error('Use a GeoJSON FeatureCollection');const incoming=json.features.map(f=>{const [lon,lat]=f.geometry?.coordinates||[];if(f.geometry?.type!=='Point'||!validNZ(lat,lon))throw Error('Only New Zealand point markers are supported');return{id:crypto.randomUUID(),lat,lon,name:String(f.properties?.name||'Imported mark').slice(0,60),notes:String(f.properties?.notes||'').slice(0,500),area:'New Zealand'};});if(marks.length+incoming.length>500)throw Error('Maximum 500 marks');marks.push(...incoming);persist();toast(`Imported ${incoming.length} marks`);}catch(err){toast(err.message);}e.target.value='';});
  }
  if(forecastMarker)forecastMarker.remove();forecastMarker=window.L.circleMarker([spot.lat,spot.lon],{radius:11,color:'#265a6b',weight:2,fill:false}).addTo(map).bindTooltip('Forecast: '+esc(spot.name));
  map.invalidateSize();
  if(lastForecastKey!==locationKey(spot)){choose(spot);map.panTo([spot.lat,spot.lon]);lastForecastKey=locationKey(spot);}
  renderMarks();syncMapForecast();
  if(initialConnection){initialConnection=false;if(read('chart-relay',DEFAULT_CHART_RELAY))changeChart('linz');}
}
