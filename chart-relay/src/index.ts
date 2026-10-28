import {env} from 'cloudflare:workers';
import {handle} from './relay.ts';
export default {fetch(request, _env, ctx){return handle(request,env,ctx);}} satisfies ExportedHandler;
