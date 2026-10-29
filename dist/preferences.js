import {finite} from './forecast.js';
import {UNIT_OPTIONS,displayValue,canonicalValue,unitLabel} from './units.js';
export const DEFAULT_LIMITS={wind:15,gust:22,wave:1,swell:null,minPeriod:null,minVisibility:1000,maxRain:null,minConfidence:50,minHours:2,horizon:72,daylightOnly:true};
export const DEFAULT_SETTINGS={unit:'kn',height:'m',temperature:'c',distance:'km',pressure:'hpa',rainfall:'mm',...DEFAULT_LIMITS};
const bounds={wind:[1,80],gust:[1,100],wave:[.1,15],swell:[.1,15],minPeriod:[1,30],minVisibility:[1000,50000],maxRain:[0,100],minConfidence:[50,95],minHours:[1,12],horizon:[24,168]};
export function normaliseSettings(raw={}){const s={...DEFAULT_SETTINGS};for(const [key,choices]of Object.entries(UNIT_OPTIONS))if(choices.some(([id])=>id===raw[key]))s[key]=raw[key];for(const [key,[min,max]]of Object.entries(bounds)){if(raw[key]===null&&DEFAULT_SETTINGS[key]===null)s[key]=null;else if(finite(raw[key]))s[key]=Math.min(max,Math.max(min,raw[key]));}s.daylightOnly=raw.daylightOnly!==false;return s;}
export const LIMIT_FIELDS=[
  {key:'wind',label:'Wind',kind:'speed',min:1,max:80},
  {key:'gust',label:'Gusts',kind:'speed',min:1,max:100},
  {key:'wave',label:'Waves',kind:'height',min:.1,max:15},
  {key:'swell',label:'Maximum swell',kind:'height',min:.1,max:15,optional:true,initial:1},
  {key:'minPeriod',label:'Minimum wave period',suffix:'s',min:1,max:30,optional:true,initial:5},
  {key:'maxRain',label:'Maximum rain chance',suffix:'%',min:0,max:100,optional:true,initial:50},
  {key:'minVisibility',label:'Minimum visibility',kind:'visibility',min:1000,max:50000}
];
const toDisplay=(v,f,s)=>f.kind==='visibility'?displayValue(v/1000,'distance',s):f.kind?displayValue(v,f.kind,s):v;
const fromDisplay=(v,f,s)=>f.kind==='visibility'?canonicalValue(v,'distance',s)*1000:f.kind?canonicalValue(v,f.kind,s):v;
export function initPreferences({get,onSave}){
  const dialog=document.querySelector('#settings-dialog'),form=document.querySelector('#settings-form');let draft;
  const panel=name=>{dialog.querySelectorAll('[data-settings-panel]').forEach(e=>e.hidden=e.dataset.settingsPanel!==name);dialog.querySelectorAll('[data-settings-tab]').forEach(e=>{e.setAttribute('aria-selected',String(e.dataset.settingsTab===name));e.tabIndex=e.dataset.settingsTab===name?0:-1;});};
  const collect=()=>{for(const f of LIMIT_FIELDS){const e=form.elements[f.key],enabled=!f.optional||form.elements['enable-'+f.key].checked;if(!enabled){draft[f.key]=null;continue;}if(e.value!==e.dataset.original||draft[f.key]===null)draft[f.key]=fromDisplay(Number(e.value),f,draft);}for(const key of ['minConfidence','minHours','horizon'])draft[key]=Number(form.elements[key].value);draft.daylightOnly=form.elements.daylightOnly.checked;};
  const paint=()=>{for(const [key]of Object.entries(UNIT_OPTIONS))form.elements[key].value=draft[key];for(const f of LIMIT_FIELDS){const e=form.elements[f.key],value=draft[f.key]??f.initial,digits=f.kind==='height'?2:f.kind==='visibility'?2:f.kind==='speed'?1:0;e.value=String(Number(toDisplay(value,f,draft).toFixed(digits)));e.dataset.original=e.value;e.min=String(Math.floor(toDisplay(f.min,f,draft)*100)/100);e.max=String(Math.ceil(toDisplay(f.max,f,draft)*100)/100);e.step='any';const label=dialog.querySelector(`[data-limit-unit="${f.key}"]`);label.textContent=f.kind==='visibility'?unitLabel('distance',draft):f.kind?unitLabel(f.kind,draft):f.suffix;if(f.optional){form.elements['enable-'+f.key].checked=draft[f.key]!==null;e.disabled=draft[f.key]===null;}}for(const key of ['minConfidence','minHours','horizon'])form.elements[key].value=draft[key];form.elements.daylightOnly.checked=draft.daylightOnly;};
  for(const [key,choices]of Object.entries(UNIT_OPTIONS)){const e=form.elements[key];e.append(...choices.map(([value,label])=>new Option(label,value)));e.addEventListener('change',()=>{collect();draft[key]=e.value;paint();});}
  for(const f of LIMIT_FIELDS.filter(f=>f.optional))form.elements['enable-'+f.key].addEventListener('change',e=>{form.elements[f.key].disabled=!e.target.checked;});
  dialog.querySelectorAll('[data-settings-tab]').forEach(button=>button.addEventListener('click',()=>panel(button.dataset.settingsTab)));
  dialog.querySelector('[role=tablist]').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const name=e.key==='Home'?'units':e.key==='End'?'limits':dialog.querySelector('[aria-selected=true]').dataset.settingsTab==='units'?'limits':'units';panel(name);dialog.querySelector(`[data-settings-tab="${name}"]`).focus();});
  form.addEventListener('invalid',e=>{const section=e.target.closest('[data-settings-panel]');if(section)panel(section.dataset.settingsPanel);},true);
  document.querySelector('#reset-limits').addEventListener('click',()=>{Object.assign(draft,DEFAULT_LIMITS);paint();});
  form.addEventListener('submit',e=>{e.preventDefault();collect();onSave(normaliseSettings(draft));dialog.close();});
  return {open(name='units'){draft=normaliseSettings(get());paint();panel(name);dialog.showModal();dialog.scrollTop=0;}};
}
