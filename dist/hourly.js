import {dateKey,NZ_ZONE,finite,number,direction,weather} from './forecast.js';
import {icon} from './icons.js';
import {confidenceLevel} from './blend.js';
import {formatValue,unitLabel} from './units.js';
export const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const speedUnit=unit=>unitLabel('speed',{unit});
export const speedValue=(n,unit='kn')=>formatValue(n,'speed',{unit});
export function intensity(value,type){
  if(!finite(value)||value<0)return 'intensity-missing';
  const steps=type==='wave'?[.5,1,1.5,2.5]:type==='rain'?[1,20,50,80]:[10,15,20,30];
  return 'intensity-'+steps.filter(n=>value>=n).length;
}
export function forecastHours(rows,hours=72,now=Date.now()/1000){
  const start=Math.floor(now/3600)*3600,end=start+hours*3600;
  return rows.filter(r=>r.ts>=start&&r.ts<end);
}
export function dateGroups(rows){
  const groups=[];
  rows.forEach((r,index)=>{const key=dateKey(r.ts),last=groups.at(-1);if(last?.key===key)last.count++;else groups.push({key,ts:r.ts,index,count:1});});
  return groups;
}
const dayFormatter=new Intl.DateTimeFormat('en-NZ',{timeZone:NZ_ZONE,weekday:'short',day:'numeric'}),hourFormatter=new Intl.DateTimeFormat('en-GB',{timeZone:NZ_ZONE,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export const dateLabel=ts=>dayFormatter.format(new Date(ts*1000));
export const hourLabel=ts=>hourFormatter.format(new Date(ts*1000));
export function hourlyTable(rows,{unit='kn',settings={unit},more=false,selected=null,interactive=false}={}){
  if(!rows.length)return '<p class="empty-state">No forecast hours available. Try refreshing.</p>';
  const groups=dateGroups(rows),starts=new Set(groups.map(g=>g.index));
  const cellClass=(r,i,key)=>[starts.has(i)?'day-boundary':'',selected===r.ts?'selected-hour':'',key==='wind'||key==='gust'?intensity(r[key],'wind'):key==='wave'||key==='swell'?intensity(r[key],'wave'):key==='rain'?intensity(r[key],'rain'):''].filter(Boolean).join(' ');
  const arrow=n=>finite(n)?`<span class="bearing-arrow" style="transform:rotate(${n}deg)" aria-hidden="true">↑</span>`:'';
  const fields=[
    ['wind','Wind',unitLabel('speed',settings),r=>formatValue(r.wind,'speed',settings)],
    ['gust','Gusts',unitLabel('speed',settings),r=>formatValue(r.gust,'speed',settings)],
    ['wave','Waves',unitLabel('height',settings),r=>formatValue(r.wave,'height',settings)],
    ['dir','Wind from','',r=>arrow(r.dir)+direction(r.dir)],
    ['period','Period','s',r=>number(r.period)],
    ['swell','Swell',unitLabel('height',settings),r=>formatValue(r.swell,'height',settings)],
    ['rain','Rain','%',r=>number(r.rain)]
  ];
  if(rows.some(r=>r.blend))fields.push(['confidence','Confidence','',r=>`<span class="confidence-cell" data-level="${confidenceLevel(r.blend?.score).toLowerCase()}" title="${finite(r.blend?.score)?r.blend.score+'/100 agreement index; not accuracy probability':'Insufficient model coverage'}">${confidenceLevel(r.blend?.score).replace('Unavailable','—')}</span>`]);
  if(more)fields.push(['swellPeriod','Swell period','s',r=>number(r.swellPeriod)],['waveDir','Waves from','',r=>direction(r.waveDir)],['swellDir','Swell from','',r=>direction(r.swellDir)],['precip','Rainfall',unitLabel('rainfall',settings),r=>formatValue(r.precip,'rainfall',settings,settings.rainfall==='in'?2:1)],['temp','Air',unitLabel('temperature',settings),r=>formatValue(r.temp,'temperature',settings)],['visibility','Visibility',unitLabel('distance',settings),r=>formatValue(finite(r.visibility)?r.visibility/1000:null,'distance',settings)],['pressure','Pressure',unitLabel('pressure',settings),r=>formatValue(r.pressure,'pressure',settings)],['water','Water',unitLabel('temperature',settings),r=>formatValue(r.water,'temperature',settings,1)],['current','Current',unitLabel('speed',settings),r=>formatValue(r.current,'speed',settings,1)]);
  return `<table class="hourly-grid"><caption class="sr-only">Hourly forecast in New Zealand time. Wind and waves are colour coded by strength, not a safety rating. Missing values are shown as a dash. Asterisk means a supplementary source; see Forecast models for details.</caption><thead><tr class="hourly-dates"><th scope="col" class="grid-corner">NZ time</th>${groups.map(g=>`<th scope="colgroup" colspan="${g.count}"><span>${escapeHTML(dateLabel(g.ts))}</span></th>`).join('')}</tr><tr class="hourly-weather"><th scope="col" class="grid-corner">Weather</th>${rows.map((r,i)=>{const w=weather(r.code),name=r.isDay===0&&w.icon==='sun'?'moon':r.isDay===0&&w.icon==='partly'?'cloud':w.icon;const content=`<span class="weather-symbol weather-${w.icon}" role="img" aria-label="${w.label}">${finite(r.code)?icon(name):'—'}</span><span>${hourLabel(r.ts)}</span>`;return `<th scope="col" class="${starts.has(i)?'day-boundary':''} ${selected===r.ts?'selected-hour':''}" data-hour-col="${r.ts}">${interactive?`<button class="hour-choice" data-hour="${r.ts}" aria-pressed="${selected===r.ts}" aria-label="${escapeHTML(dateLabel(r.ts))} ${hourLabel(r.ts)}, ${w.label}">${content}</button>`:content}</th>`;}).join('')}</tr></thead><tbody>${fields.map(([key,label,suffix,format])=>`<tr data-stat="${key}"><th scope="row"${rows.some(r=>r.supplemented?.[key])?' title="Supplemented from best match; see Forecast models"':''}>${label}${rows.some(r=>r.supplemented?.[key])?'<sup>*</sup>':''}${suffix?` <small>${suffix}</small>`:''}</th>${rows.map((r,i)=>`<td class="${cellClass(r,i,key)}">${format(r)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
