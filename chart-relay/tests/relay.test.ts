import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handle,validTile} from '../src/relay.ts';
const pending:Promise<unknown>[]=[];
const ctx={waitUntil(p:Promise<unknown>){pending.push(p);}};
const env={LINZ_API_KEY:'private-test-value',CHART_LIMIT:{async limit(){return {success:true};}}};
const cache={async match(){return undefined;},async put(){}} as unknown as Cache;
const request=(path:string,options:RequestInit={})=>new Request('https://relay.example'+path,{...options,headers:{Origin:'https://dazzlingfields.github.io',...options.headers}});
test('blocks unknown paths, arbitrary URLs, non-NZ tiles and write methods before upstream',async()=>{
  for(const path of ['/wms','/tiles/layer-1/10/1000/600.png','/tiles/layer-51247/10/0/0.png','/catalogue.json?url=https://example.org'])assert.ok((await handle(request(path),env,ctx)).status>=400);
  assert.equal((await handle(request('/catalogue.json',{method:'POST'}),env,ctx)).status,405);
  assert.equal(validTile('layer-51247',10,1009,624),true);
});
test('catalogue never exposes provider credentials or upstream URLs',async()=>{
  const r=await handle(request('/catalogue.json'),env,ctx);assert.equal(r.status,200);const text=await r.text();assert.ok(!text.includes(env.LINZ_API_KEY));assert.ok(!text.includes('services;key='));assert.equal(r.headers.get('access-control-allow-origin'),'https://dazzlingfields.github.io');
});
test('CORS rejects foreign origins and rate limiter fails closed',async()=>{
  assert.equal((await handle(request('/catalogue.json',{headers:{Origin:'https://other.example'}}),env,ctx)).status,403);
  assert.equal((await handle(request('/catalogue.json'),{...env,CHART_LIMIT:{async limit(){return {success:false};}}},ctx)).status,429);
});
test('tile responses strip upstream secret headers and errors',async()=>{
  const png=async()=>new Response(new Uint8Array([137,80,78,71]),{headers:{'Content-Type':'image/png','X-Upstream-Secret':env.LINZ_API_KEY}});
  const r=await handle(request('/tiles/layer-51247/10/1009/624.png'),env,ctx,png,cache);assert.equal(r.status,200);assert.equal(r.headers.get('X-Upstream-Secret'),null);await Promise.all(pending);
  const failure=await handle(request('/tiles/layer-51247/10/1009/624.png'),env,ctx,async()=>{throw Error(env.LINZ_API_KEY);},cache);assert.equal(failure.status,502);assert.ok(!(await failure.text()).includes(env.LINZ_API_KEY));
});
test('only follows HTTPS redirects within the tile provider',async()=>{
  let calls=0;
  const r=await handle(request('/tiles/layer-51247/10/1009/624.png'),env,ctx,async()=>{calls++;return new Response(null,{status:302,headers:{Location:'https://attacker.example/'+env.LINZ_API_KEY}});},cache);
  assert.equal(r.status,502);assert.equal(calls,1);assert.ok(!(await r.text()).includes(env.LINZ_API_KEY));
});
