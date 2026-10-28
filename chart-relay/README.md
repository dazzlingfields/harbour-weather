# Harbour chart connection

Public read-only relay: https://harbour-chart-relay.dazzlingfields.workers.dev

The website and APK contain only this URL (`dist/config.js`). The LINZ key is a Cloudflare `secret_text` binding named `LINZ_API_KEY`. It is not in this repository, the APK, browser storage or responses. The connection dialog accepts another HTTPS relay URL, so hosting can change without rebuilding the app.

The relay serves a sanitised catalogue and PNG tiles for 221 allowlisted NZ raster chart layers. The catalogue was checked against LINZ WMTS capabilities on 28 October 2026. It includes sheet bounds and compilation scales, not credential-bearing upstream URLs. Catalogue date is not a chart correction date. Raster images remain reference material, not navigation charts or ENC.

Requests are bounded by sheet, NZ extent, zoom 5–18, method and provider host. Tiles are cached for 24 hours. Cloudflare rate limiting allows 240 requests per client IP per minute at each Cloudflare location; it is approximate and not a global quota. CORS allows the Pages site, Capacitor localhost origins and local preview. This is a public service: CORS does not authenticate native apps or stop other HTTP clients. It does not provide private chart access or user accounts.

Logs are enabled with sampling. Trace configuration is enabled with zero sampling because the upstream provider embeds its key in the URL path. Code never logs upstream URLs or errors. Secrets must not be added to observability output.

## Development and deployment

Use Node 22+, pnpm 11.25.0 and the **cf CLI** (configuration is `cloudflare.config.ts`, not Wrangler).

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
node --experimental-strip-types --test tests/relay.test.ts
cf auth login
cf deploy
```

Existing Cloudflare secrets are retained by deployments. For a new deployment or key rotation, use `cf deploy --secrets-file <private-file>` with `{"LINZ_API_KEY":"YOUR_KEY"}` in a temporary file outside the repository; delete it after deployment. Never put the key on a command line, in GitHub workflow variables, or in app configuration. A new instance also needs its allowed origins configured and its public URL set in `dist/config.js`.

`src/catalogue.json` deliberately allowlists reviewed chart layers. To update it, obtain your own LINZ WMTS GetCapabilities response privately, extract only `Chart NZ` identifiers, WGS84 bounds, titles and scales, review changes, then deploy. Do not publish raw capabilities: they contain the key in resource URLs. Official documentation: [LINZ WMTS](https://www.linz.govt.nz/guidance/data-service/linz-data-service-guide/map-tile-services/lds-web-map-tile-service-specifications).

GitHub checks the relay types, security tests and build on changes. Deployment is through an authorised local cf session; no Cloudflare account token is stored in GitHub.
