import catalogue from './catalogue.json' with {type:'json'};
type RelayEnv={LINZ_API_KEY:string;CHART_LIMIT:{limit(options:{key:string}):Promise<{success:boolean}>}};
type RelayContext={waitUntil(promise:Promise<unknown>):void};
const origins=new Set(['https://dazzlingfields.github.io','https://localhost','http://localhost','capacitor://localhost','http://127.0.0.1:4174','http://127.0.0.1:4173']);
const sheets=new Map(catalogue.sheets.map(s=>[s.name,s]));
export function validTile(layer:string,z:number,x:number,y:number){
  const sheet=sheets.get(layer);if(!sheet||![z,x,y].every(Number.isSafeInteger)||z<5||z>18||x<0||y<0||x>=2**z||y>=2**z)return false;
  const longitude=(x:number)=>x/2**z*360-180;
  const latitude=(y:number)=>Math.atan(Math.sinh(Math.PI*(1-2*y/2**z)))*180/Math.PI;
  const west=longitude(x),east=longitude(x+1),north=latitude(y),south=latitude(y+1),[[s,w],[n,e]]=sheet.bounds;
  return west<Math.min(180,e)&&east>Math.max(165,w)&&south<Math.min(-33,n)&&north>Math.max(-49,s);
}
export async function handle(request:Request,env:RelayEnv,ctx:RelayContext,upstream:typeof fetch=fetch,cache?:Cache):Promise<Response>{
  const url=new URL(request.url),origin=request.headers.get('Origin');
  const cors:Record<string,string>={'Vary':'Origin','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
  if(origin&&origins.has(origin))cors['Access-Control-Allow-Origin']=origin;
  const reply=(message:string,status:number,extra:Record<string,string>={})=>new Response(JSON.stringify({message}),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store',...extra}});
  if(origin&&!origins.has(origin))return reply('Origin not allowed',403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...cors,'Access-Control-Allow-Methods':'GET, HEAD, OPTIONS','Access-Control-Max-Age':'86400'}});
  if(!['GET','HEAD'].includes(request.method))return reply('Method not allowed',405,{'Allow':'GET, HEAD, OPTIONS'});
  if(url.search)return reply('Query parameters are not supported',400);
  const match=url.pathname.match(/^\/tiles\/(layer-\d+)\/(\d{1,2})\/(\d{1,6})\/(\d{1,6})\.png$/);
  if(url.pathname!=='/catalogue.json'&&(!match||!validTile(match[1],Number(match[2]),Number(match[3]),Number(match[4]))))return reply('Chart resource not found',404);
  // Public read-only chart service. CORS is not authentication.
  // Use Cloudflare's verified client address, never X-Forwarded-For.
  try{if(!(await env.CHART_LIMIT.limit({key:request.headers.get('CF-Connecting-IP')||'unknown'})).success)return reply('Chart request limit reached',429,{'Retry-After':'60'});}catch{return reply('Chart limiter unavailable',503);}
  if(url.pathname==='/catalogue.json')return new Response(request.method==='HEAD'?null:JSON.stringify(catalogue),{headers:{...cors,'Content-Type':'application/json','Cache-Control':'public, max-age=3600'}});
  if(!env.LINZ_API_KEY)return reply('Chart connection is not configured',503);
  const key=new Request(url.origin+url.pathname,{method:'GET'});
  const storage=cache??caches.default;
  const cached=await storage.match(key);
  if(cached){const h=new Headers(cached.headers);for(const [k,v]of Object.entries(cors))h.set(k,v);return new Response(request.method==='HEAD'?null:cached.body,{headers:h});}
  const [,layer,z,x,y]=match!;
  try{
    const path=`https://tiles-cdn.koordinates.com/services;key=${env.LINZ_API_KEY}/tiles/v4/layer=${layer.slice(6)},style=auto/EPSG:3857/${z}/${x}/${y}.png`;
    const response=await upstream(path,{redirect:'manual',signal:AbortSignal.timeout(15000)});
    // The CDN may redirect to another Koordinates tile host. Follow only that
    // provider's HTTPS hosts; never return a credential-bearing Location header.
    let tile=response;
    if([301,302,303,307,308].includes(response.status)){
      const target=new URL(response.headers.get('Location')||'',path);
      if(target.protocol!=='https:'||!(target.hostname==='koordinates.com'||target.hostname.endsWith('.koordinates.com')))return reply('Unexpected chart redirect',502);
      tile=await upstream(target.href,{redirect:'error',signal:AbortSignal.timeout(15000)});
    }
    if(!tile.ok||!tile.headers.get('Content-Type')?.toLowerCase().startsWith('image/png'))return reply(`LINZ chart tile unavailable (${tile.status})`,502);
    // Whitelist response headers: never forward upstream URL, key, cookies or XML.
    const clean=new Response(tile.body,{headers:{'Content-Type':'image/png','Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'}});
    ctx.waitUntil(storage.put(key,clean.clone()).catch(()=>{}));
    return new Response(request.method==='HEAD'?null:clean.body,{headers:{...Object.fromEntries(clean.headers),...cors}});
  }catch{return reply('LINZ chart connection unavailable',502);}
}
