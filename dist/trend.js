import {finite,clock,number} from './forecast.js';
import {quantity,unitLabel,formatValue} from './units.js';
export function windTrend(rows,settings){
  const known=rows.filter(r=>finite(r.wind));if(!known.length)return '<p class="empty-state">Wind trend will appear when the forecast loads.</p>';
  const width=600,height=100,pad=8,max=Math.max(settings.wind*1.25,...known.map(r=>r.blend?.fields?.wind?.max??r.wind),1),start=rows[0].ts,end=rows.at(-1).ts||start+3600;
  const x=r=>pad+(r.ts-start)/Math.max(end-start,3600)*(width-pad*2),y=value=>height-12-value/max*(height-24);
  // Missing hours break the line rather than implying continuity.
  let path='',previous;for(const row of rows){if(!finite(row.wind)){previous=null;continue;}path+=`${previous&&row.ts-previous.ts===3600?'L':'M'}${x(row).toFixed(1)},${y(row.wind).toFixed(1)} `;previous=row;}
  const limit=y(settings.wind),peak=Math.max(...known.map(r=>r.wind)),labels=[0,Math.floor((rows.length-1)/3),Math.floor(2*(rows.length-1)/3),rows.length-1];
  const samples=labels.map(i=>rows[i]);
  return `<div class="trend-title"><span>Wind <b>${unitLabel('speed',settings)}</b></span><span>Peak ${quantity(peak,'speed',settings)} · dashed line: your limit</span></div><svg class="wind-trend" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Wind trend. Peak ${quantity(peak,'speed',settings)}. Your limit ${quantity(settings.wind,'speed',settings)}."><line x1="${pad}" x2="${width-pad}" y1="${limit}" y2="${limit}" class="trend-limit"/><path d="${path}" class="trend-line"/>${known.filter(r=>r.wind>settings.wind).map(r=>`<circle cx="${x(r)}" cy="${y(r.wind)}" r="2.6" class="trend-excess"/>`).join('')}</svg><div class="trend-samples">${samples.map(r=>`<div><time>${clock(r.ts).replace(':00','')}</time><strong>${formatValue(r.wind,'speed',settings)} <small>${unitLabel('speed',settings)}</small></strong><span>Sea ${quantity(r.wave,'height',settings)}</span></div>`).join('')}</div>`;
}
