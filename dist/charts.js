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

// The client only knows the relay URL. Its server holds the LINZ API key.
export async function connectLinz(map,connection,status){
  const L=window.L;let url;
  try{url=new URL(connection);}catch{throw Error('Enter the HTTPS chart connection URL.');}
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('Use an HTTPS connection URL without credentials or query parameters.');
  const base=url.href.replace(/\/$/,'');
  let response;try{response=await fetch(base+'/catalogue.json',{signal:AbortSignal.timeout(20000),credentials:'omit'});}catch{throw Error('Chart connection unavailable. Check the URL and internet connection.');}
  if(!response.ok)throw Error(response.status===429?'Chart request limit reached. Try again shortly.':'Chart connection failed.');
  const catalogue=await response.json();
  const sheets=(catalogue.sheets||[]).filter(s=>/^layer-\d+$/.test(s.name)&&typeof s.title==='string'&&Array.isArray(s.bounds)&&s.bounds.length===2&&s.bounds.flat().length===4&&s.bounds.flat().every(Number.isFinite));
  if(!sheets.length||sheets.length>500)throw Error('The connection returned no valid NZ chart sheets.');
  const layers=new Map();let enabled=false;
  const update=()=>{
    if(!enabled)return;
    const centre=map.getCenter();
    const visible=sheets.filter(s=>L.latLngBounds(s.bounds).contains(centre));
    visible.sort((a,b)=>(b.scale||1e9)-(a.scale||1e9));
    const wanted=visible.slice(-3),names=new Set(wanted.map(s=>s.name));
    for(const [name,layer]of layers)if(!names.has(name)){map.removeLayer(layer);layers.delete(name);}
    for(const sheet of wanted)if(!layers.has(sheet.name)){
      const layer=L.tileLayer(base+'/tiles/'+sheet.name+'/{z}/{x}/{y}.png',{maxZoom:18,minZoom:5,bounds:sheet.bounds,pane:'chartPane',attribution:'Charts © <a href="https://data.linz.govt.nz/" target="_blank" rel="noopener">LINZ</a> · CC BY 4.0'}).addTo(map);
      layer.on('tileerror',()=>status('Some chart tiles unavailable · retry or use coast map'));
      layers.set(sheet.name,layer);
    }
    status(wanted.length?`${wanted.at(-1).title.match(/^Chart NZ [0-9]+/)?.[0]||'LINZ chart'} · reference only, not for navigation`:'No LINZ chart sheet at this position');
  };
  if(!map.getPane('chartPane'))map.createPane('chartPane').style.zIndex=350;
  map.on('moveend zoomend',update);
  const hide=()=>{enabled=false;for(const layer of layers.values())map.removeLayer(layer);layers.clear();};
  return {show(){enabled=true;update();},hide,destroy(){hide();map.off('moveend zoomend',update);}};
}
