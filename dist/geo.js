export function distanceKm(a,b){const rad=n=>n*Math.PI/180;const dlat=rad(b.lat-a.lat),dlon=rad(b.lon-a.lon);const h=Math.sin(dlat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dlon/2)**2;return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));}
export function bearing(a,b){const rad=n=>n*Math.PI/180;const d=rad(b.lon-a.lon);return (Math.atan2(Math.sin(d)*Math.cos(rad(b.lat)),Math.cos(rad(a.lat))*Math.sin(rad(b.lat))-Math.sin(rad(a.lat))*Math.cos(rad(b.lat))*Math.cos(d))*180/Math.PI+360)%360;}
export function nearestStation(spot,stations){return stations.map(s=>({...s,distance:distanceKm(spot,s)})).sort((a,b)=>a.distance-b.distance)[0];}
export const validNZ=(lat,lon)=>Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=-49&&lat<=-33&&lon>=165&&lon<=180;
