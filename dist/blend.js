import {finite,dateKey} from './forecast.js';

// Equal initial weights: there are no local observations to justify skill weights.
// Huber influence limits a distant scalar outlier; the full range is retained.
const scales={wind:5,gust:7,temp:3,rain:25,precip:2,pressure:5,visibility:5000,wave:.5,period:3,swell:.5,swellPeriod:3,water:2,current:1};
const angles=new Set(['dir','waveDir','swellDir','currentDir']);
const fields=[...Object.keys(scales),...angles,'code','isDay'];
const median=values=>{const a=[...values].sort((a,b)=>a-b),i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2;};
export const confidenceLevel=score=>!finite(score)?'Unavailable':score>=75?'High':score>=50?'Medium':'Low';
function combine(values,key,lead){
  if(!values.length)return {value:null,stats:{count:0,score:null,min:null,max:null}};
  const min=Math.min(...values),max=Math.max(...values),count=values.length;
  let value,disagreement;
  if(angles.has(key)){
    const x=values.reduce((s,v)=>s+Math.cos(v*Math.PI/180),0)/count,y=values.reduce((s,v)=>s+Math.sin(v*Math.PI/180),0)/count;
    const concentration=Math.hypot(x,y);
    value=concentration<.05?null:((Math.atan2(y,x)*180/Math.PI)%360+360)%360;
    disagreement=(1-concentration)*85;
  }else if(key==='code'){
    const votes=new Map();values.forEach(v=>votes.set(v,(votes.get(v)||0)+1));
    // Preserve storm signals instead of averaging categorical weather codes.
    value=values.some(v=>v>=95)?Math.max(...values):[...votes].sort((a,b)=>b[1]-a[1]||b[0]-a[0])[0][0];
    disagreement=30*(1-Math.max(...votes.values())/count);
  }else if(key==='isDay'){value=values[0];disagreement=0;}
  else{
    const mid=median(values),scale=scales[key]||1;
    const weights=values.map(v=>count<3?1:Math.min(1,2*scale/Math.max(Math.abs(v-mid),.0001)));
    value=key==='visibility'?min:values.reduce((s,v,i)=>s+v*weights[i],0)/weights.reduce((s,v)=>s+v,0);
    disagreement=Math.min(75,35*(max-min)/scale);
  }
  const score=Math.round(Math.max(5,Math.min(count===1?35:count===2?78:92,92-disagreement-Math.min(25,Math.max(0,lead)*.15)-(3-Math.min(count,3))*7)));
  return {value,stats:{count,min,max,score}};
}
export function blendRows(members,{now=Date.now()/1000}={}){
  const byTime=new Map();
  for(const member of members)for(const row of member.rows){if(!byTime.has(row.ts))byTime.set(row.ts,[]);byTime.get(row.ts).push({id:member.id,row});}
  return [...byTime].sort((a,b)=>a[0]-b[0]).map(([ts,entries])=>{
    const row={ts},stats={};
    for(const key of fields){const inputs=entries.filter(e=>finite(e.row[key])&&!e.row.supplemented?.[key]);const result=combine(inputs.map(e=>e.row[key]),key,(ts-now)/3600);row[key]=result.value;stats[key]={...result.stats,sources:inputs.map(e=>e.id)};}
    if(finite(row.wind)&&finite(row.gust))row.gust=Math.max(row.wind,row.gust);
    const core=['wind','gust','wave'];
    const scores=core.map(k=>stats[k].score);
    for(const key of ['dir','waveDir'])if(finite(stats[key].score))scores.push(stats[key].score);
    const score=core.some(k=>!finite(stats[k].score))?null:Math.min(...scores);
    row.blend={score,level:confidenceLevel(score),fields:stats};return row;
  });
}
export function blendDaily(rows,daily){
  if(!daily?.time)return daily;
  const groups=new Map();for(const row of rows){const key=dateKey(row.ts);if(!groups.has(key))groups.set(key,[]);if(finite(row.temp))groups.get(key).push(row.temp);}
  return {...daily,temperature_2m_max:daily.time.map(t=>{const a=groups.get(dateKey(t))||[];return a.length?Math.max(...a):null;}),temperature_2m_min:daily.time.map(t=>{const a=groups.get(dateKey(t))||[];return a.length?Math.min(...a):null;})};
}
export const upperEstimate=(row,key)=>row.blend?.fields?.[key]?.max??row[key];
