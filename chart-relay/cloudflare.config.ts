import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "harbour-chart-relay",
		compatibilityDate: "2026-10-28",
		entrypoint,
		// Upstream LDS credentials are in URL paths. Keep trace sampling off.
		observability: {enabled:true,redactQueryString:true,logs:{enabled:true,headSamplingRate:0.1},traces:{enabled:true,headSamplingRate:0}},
		env: {
			LINZ_API_KEY: bindings.secret(),
			CHART_LIMIT: bindings.rateLimit({namespace:"1001",simple:{limit:240,period:60}}),
		},
	},
});
