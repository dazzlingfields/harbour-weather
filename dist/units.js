import {finite,number} from './forecast.js';
export const UNIT_OPTIONS={
  unit:[['kn','Knots'],['kmh','km/h'],['ms','m/s'],['mph','mph']],
  height:[['m','Metres'],['ft','Feet']],
  temperature:[['c','Celsius'],['f','Fahrenheit']],
  distance:[['km','Kilometres'],['nm','Nautical mi'],['mi','Miles']],
  pressure:[['hpa','hPa'],['inhg','inHg']],
  rainfall:[['mm','Millimetres'],['in','Inches']]
};
export const unitLabel=(kind,s={})=>({speed:{kn:'kn',kmh:'km/h',ms:'m/s',mph:'mph'}[s.unit||'kn'],height:s.height==='ft'?'ft':'m',temperature:s.temperature==='f'?'°F':'°C',distance:{km:'km',nm:'nm',mi:'mi'}[s.distance||'km'],pressure:s.pressure==='inhg'?'inHg':'hPa',rainfall:s.rainfall==='in'?'in':'mm'}[kind]);
// Canonical values: knots, metres, Celsius, kilometres, hPa and millimetres.
export function displayValue(value,kind,s={}){
  if(!finite(value))return null;
  return kind==='speed'?value*({kn:1,kmh:1.852,ms:1852/3600,mph:1852/1609.344}[s.unit||'kn']||1):kind==='height'&&s.height==='ft'?value/.3048:kind==='temperature'&&s.temperature==='f'?value*9/5+32:kind==='distance'?value/({km:1,nm:1.852,mi:1.609344}[s.distance||'km']||1):kind==='pressure'&&s.pressure==='inhg'?value/33.8638866667:kind==='rainfall'&&s.rainfall==='in'?value/25.4:value;
}
export function canonicalValue(value,kind,s={}){
  if(!finite(value))return null;
  if(kind==='temperature')return s.temperature==='f'?(value-32)*5/9:value;
  return value/(displayValue(1,kind,s)||1);
}
export const formatValue=(value,kind,s={},digits)=>number(displayValue(value,kind,s),digits??(kind==='height'?1:kind==='distance'?1:kind==='pressure'&&s.pressure==='inhg'?2:kind==='rainfall'&&s.rainfall==='in'?2:0));
export const quantity=(value,kind,s={},digits)=>`${formatValue(value,kind,s,digits)} ${unitLabel(kind,s)}`;
