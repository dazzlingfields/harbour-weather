import {unzipSync,strFromU8} from './vendor/fflate.js';

// Openly licensed LINZ NZ 53 export. Keep its dates and original georeferencing.
// This is reference imagery, not a live or corrected ENC service.
export const REFERENCE_CHART={
  title:'LINZ NZ 53 · Hauraki Gulf',
  updated:'13 Jan 2022',
  downloaded:'18 Apr 2023',
  licence:'CC BY 4.0',
  source:'https://data.linz.govt.nz/layer/51247-chart-nz-53-bream-head-to-slipper-island-including-hauraki-gulf-tikapa-moana/',
  archive:'https://www.arcgis.com/sharing/rest/content/items/c7f9914885b84b409226cdeeb6108fc4/data',
  sha256:'ebba460138afe89f0b51fe53c3267a69d72d8c78b3c03bb35bc0b0649877a446',
  bounds:[[-37.083297,174.333333],[-35.835644,176.664456]]
};
let archivePromise;
async function loadArchive(){
  if(archivePromise)return archivePromise;
  archivePromise=(async()=>{
    let cache,response;
    try{cache=await caches.open('harbour-reference-charts-v1');response=await cache.match(REFERENCE_CHART.archive);}catch{}
    if(!response){response=await fetch(REFERENCE_CHART.archive,{signal:AbortSignal.timeout(45000)});if(!response.ok)throw Error('Chart download unavailable');}
    const bytes=new Uint8Array(await response.arrayBuffer());
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
    if(digest!==REFERENCE_CHART.sha256)throw Error('Chart package changed. Source review required.');
    if(cache)try{await cache.put(REFERENCE_CHART.archive,new Response(bytes,{headers:{'Content-Type':'application/zip'}}));}catch{}
    const files=unzipSync(bytes);
    const tiles=[];
    const xml=new DOMParser();
    for(const [path,bytes] of Object.entries(files)){
      const match=path.match(/\.layerdata\/(\d+)\/\d+\/\d+\.kml$/);if(!match)continue;
      const document=xml.parseFromString(strFromU8(bytes),'application/xml');
      const overlay=document.getElementsByTagName('GroundOverlay')[0];if(!overlay)continue;
      const box=overlay.getElementsByTagName('LatLonBox')[0];
      const val=name=>Number(box?.getElementsByTagName(name)[0]?.textContent);
      const [south,west,north,east]=['south','west','north','east'].map(val);
      const href=overlay.getElementsByTagName('href')[0]?.textContent;
      const file=path.slice(0,path.lastIndexOf('/')+1)+href;
      if(![south,west,north,east].every(Number.isFinite)||!files[file]||south>=north||west>=east)continue;
      tiles.push({file,level:Number(match[1]),bounds:[[south,west],[north,east]]});
    }
    if(!tiles.length)throw Error('Chart contains no georeferenced imagery');
    return {files,tiles};
  })().catch(error=>{archivePromise=null;throw error;});
  return archivePromise;
}

export function referenceChart(map,status){
  const L=window.L,layer=L.layerGroup(),activeTiles=new Map();let data,enabled=false,loading=false;
  if(!map.getPane('chartPane'))map.createPane('chartPane').style.zIndex=350;
  const coverage=L.latLngBounds(REFERENCE_CHART.bounds);
  const update=()=>{
    if(!enabled)return;
    if(!map.getBounds().intersects(coverage)){
      clear();status('Outside included NZ 53 coverage · choose Hauraki chart or connect LINZ');return;
    }
    if(!data){
      if(!loading){loading=true;status('Loading LINZ reference chart · 10 MB first download');loadArchive().then(value=>{data=value;loading=false;update();}).catch(error=>{loading=false;if(enabled)status(error.message+'. Coast map shown.');});}
      return;
    }
    const level=Math.min(4,Math.max(0,map.getZoom()-8));
    const visible=data.tiles.filter(t=>t.level===level&&map.getBounds().intersects(t.bounds));
    const names=new Set(visible.map(t=>t.file));
    for(const [file,entry] of activeTiles)if(!names.has(file)){layer.removeLayer(entry.overlay);URL.revokeObjectURL(entry.url);activeTiles.delete(file);}
    for(const tile of visible){
      if(activeTiles.has(tile.file))continue;
      const url=URL.createObjectURL(new Blob([data.files[tile.file]],{type:tile.file.endsWith('.png')?'image/png':'image/jpeg'}));
      const overlay=L.imageOverlay(url,tile.bounds,{pane:'chartPane',interactive:false,attribution:'Chart © <a href="'+REFERENCE_CHART.source+'" target="_blank" rel="noopener">LINZ</a> · CC BY 4.0'}).addTo(layer);
      activeTiles.set(tile.file,{url,overlay});
    }
    status('LINZ NZ 53 · 13 Jan 2022 · reference only, not for navigation');
  };
  function clear(){for(const entry of activeTiles.values()){layer.removeLayer(entry.overlay);URL.revokeObjectURL(entry.url);}activeTiles.clear();}
  map.on('moveend zoomend resize',update);
  return {
    show(){enabled=true;layer.addTo(map);update();},
    hide(){enabled=false;clear();map.removeLayer(layer);},
    fit(){map.fitBounds(coverage);},
    refresh:update
  };
}

// A user's LDS key stays on their device; never put it in the repository.
export async function connectLinz(map,key,status){
  const L=window.L;
  if(!/^[a-f0-9]{32}$/i.test(key))throw Error('Enter a valid LINZ Data Service key.');
  const base='https://data.linz.govt.nz/services;key='+key+'/';
  const response=await fetch(base+'wms?service=WMS&request=GetCapabilities&version=1.1.1',{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('LINZ connection failed. Check the key.');
  const doc=new DOMParser().parseFromString(await response.text(),'application/xml');
  if(doc.querySelector('parsererror,ServiceException'))throw Error('LINZ did not return a chart catalogue.');
  const sheets=[];
  for(const node of doc.getElementsByTagName('Layer')){
    const child=tag=>Array.from(node.children).find(e=>e.localName===tag);
    const name=child('Name')?.textContent,title=child('Title')?.textContent,box=child('LatLonBoundingBox');
    if(!name||!/^Chart NZ /i.test(title||'')||!box)continue;
    const bounds=[[Number(box.getAttribute('miny')),Number(box.getAttribute('minx'))],[Number(box.getAttribute('maxy')),Number(box.getAttribute('maxx'))]];
    if(bounds.flat().every(Number.isFinite))sheets.push({name,title,bounds});
  }
  if(!sheets.length)throw Error('No LINZ raster chart sheets were returned.');
  const layers=new Map();let enabled=false;
  const update=()=>{
    if(!enabled)return;
    const centre=map.getCenter();
    const visible=sheets.filter(s=>L.latLngBounds(s.bounds).contains(centre));
    visible.sort((a,b)=>L.latLngBounds(b.bounds).getSouthWest().distanceTo(L.latLngBounds(b.bounds).getNorthEast())-L.latLngBounds(a.bounds).getSouthWest().distanceTo(L.latLngBounds(a.bounds).getNorthEast()));
    const wanted=visible.slice(-3),names=new Set(wanted.map(s=>s.name));
    for(const [name,layer] of layers)if(!names.has(name)){map.removeLayer(layer);layers.delete(name);}
    for(const sheet of wanted)if(!layers.has(sheet.name)){
      const layer=L.tileLayer.wms(base+'wms',{layers:sheet.name,format:'image/png',transparent:true,version:'1.1.1',bounds:sheet.bounds,pane:'chartPane',attribution:'Chart images © <a href="https://data.linz.govt.nz/" target="_blank" rel="noopener">LINZ</a> · CC BY 4.0'}).addTo(map);
      layer.on('tileerror',()=>status('LINZ chart request failed. Check the connection.'));
      layers.set(sheet.name,layer);
    }
    status(wanted.length?'LINZ raster chart imagery · check sheet dates · not for navigation':'No LINZ chart sheet at this position');
  };
  if(!map.getPane('chartPane'))map.createPane('chartPane').style.zIndex=350;
  map.on('moveend zoomend',update);
  return {show(){enabled=true;update();},hide(){enabled=false;for(const layer of layers.values())map.removeLayer(layer);layers.clear();}};
}
