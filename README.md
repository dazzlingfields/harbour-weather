# Harbour

New Zealand boating and fishing weather. A static, mobile-first web app and a Capacitor Android app share the same `dist/` source.

## Baseline features

- Seven-day weather and marine forecasts from Open-Meteo, with 24/48-hour tables.
- Wind, gusts, direction, waves, swell, periods, water temperature, rain, visibility, pressure, UV, daylight and approximate moon phase.
- Daylight trip windows compared with personal wind, gust and wave limits.
- Published LINZ high/low tides for 18 ports, covering 2026 and 2027. Select the tide port separately; the nearest port is only a starting point.
- Full-tab marine map, with the original LINZ NZ 53 Hauraki Gulf reference chart (depth soundings, contours, reefs and chart symbols), optional OpenSeaMap seamarks, coordinate selection, named markers, notes and straight-line distance/bearing. Tap for a bottom weather/tide panel and a scrollable seven-day strip. Popular boating locations and searchable saved marks are included. Mark editing opens in a collapsible panel.
- GeoJSON marker import/export, saved forecast spots and local preferences.
- PWA manifest, app icons, cached application shell and timestamped last-downloaded forecasts.
- Native Android project, Gradle wrapper, APK build workflow and optional release signing.

## Run locally

Node 22+ is recommended. The website itself has no build step or runtime package dependency.

```sh
node scripts/serve.mjs
node scripts/check.mjs
node --test tests/*.test.mjs
```

Open http://127.0.0.1:4173/. `dist/` is both the website source and the Android web bundle. Do not edit copied files inside `android/app/src/main/assets/public/`.

## GitHub Pages

In repository **Settings → Pages**, choose **GitHub Actions** as the source. Pushes to `main` run `.github/workflows/pages.yml`, validate the source, and publish an entry page plus `dist/`. The root entry redirects to `./dist/`, which also supports the repository's initial branch-root publishing setting. All application paths are relative, including the service worker. The website and APK continue to use exactly the same `dist/` assets.

Expected site URL after successful deployment: https://dazzlingfields.github.io/harbour-weather/

## Android APK

The native project is in `android/`. App ID: `nz.harbour.weather`; version: `0.2.0`, version code `2`. Confirm the app ID before distributing a release; keep it stable for subsequent updates.

**GitHub build:** every relevant push to `main` runs **Build Android APK**. Open its successful Actions run and download the `harbour-android-debug` artifact. It contains `app-debug.apk`, intended for testing. GitHub retains artifacts for 30 days. A debug build is signed with the runner's temporary debug key; later debug builds may need the previous install removed. Export markers first.

**Local build:** install Node 22+, pnpm 11.25.0, JDK 21 and Android Studio with Android SDK 36. Then:

```sh
pnpm install --frozen-lockfile
pnpm android:sync
pnpm android:open
```

In Android Studio choose Build APK, or run `android/gradlew assembleDebug` (Windows: `android\gradlew.bat assembleDebug`). APK output: `android/app/build/outputs/apk/debug/app-debug.apk`.

The APK bundles the web assets locally. It does not wrap the GitHub Pages URL or require a Pages login. Forecast requests and map tiles need internet. Bundled tide tables and saved markers remain available without internet. The service worker is skipped in native Capacitor; the app shell is already bundled.

### Signed release

Create and back up your release keystore. Add these repository **Actions secrets**:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded keystore file |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Signing key alias |
| `ANDROID_KEY_PASSWORD` | Signing key password |

Run **Build Android APK → Run workflow**, enabling the release option. The workflow validates the secrets, writes the key only to the runner's temporary folder, builds a signed APK and AAB, uploads them as `harbour-android-release`, and removes the temporary key. Keys and passwords must never be committed. Increment `versionCode` in `android/app/build.gradle` before distributing updates. Store publication, signing credentials, device testing and store listing are still required before production distribution.

## Structure

| Source | Responsibility |
| --- | --- |
| `dist/api.js` | Weather/marine requests, location search, coastal presets |
| `dist/forecast.js` | Forecast alignment, formatting and trip comparisons |
| `dist/storage.js` | Device-local persistence; replace here for future native storage |
| `dist/app.js` | Forecast views and controls |
| `dist/tides.js`, `dist/data/` | LINZ port selection and tide events |
| `dist/map.js`, `dist/geo.js`, `dist/charts.js` | Map, chart providers, markers, distance and bearing |
| `dist/vendor/` | Bundled Leaflet 1.9.4 and licence |
| `capacitor.config.json`, `android/` | Native wrapper and signing configuration |

Weather and included reference charts need no app login. The default chart connection is a separate Cloudflare relay with its LINZ key held in a server secret. Only the public relay URL is packaged into the website and APK. **Marine map → Connection** accepts an alternative relay URL. No provider key is requested or saved by the app. Only Android internet permission is used. Marks are device-local; GeoJSON transfers them between browser and APK. Native export copies GeoJSON to the clipboard with a selectable-text fallback. See [chart relay setup and security](chart-relay/README.md).

## Forecast sources

| Information | Actual source used by the code |
| --- | --- |
| Wind/gusts, air temperature, rain, pressure, visibility, UV and daylight | Open-Meteo Forecast API, `api.open-meteo.com/v1/forecast` |
| Waves, swell, periods, sea temperature and model currents | Open-Meteo Marine API, `marine-api.open-meteo.com/v1/marine` |
| High/low tide times and heights | Bundled LINZ predictions for 18 ports, 2026–2027 |
| Marine warnings | External MetService link only; not downloaded |

Requests use the provider's default/best-match models, not a pinned model or MetService forecast. They are model estimates, not live station observations. Weather uses the nearest grid cell, while marine data selects a sea cell; coordinates can differ from the selected point. The visible timestamp is the download time, not the model issue/run time. All displayed times are New Zealand local time. The map panel lists nearby-port tides with station distance; local tides can differ.

Tapping the map, a saved mark or a popular location opens its forecast at the bottom. The seven-day cards scroll horizontally; selecting a card shows that day's conditions and port tides. Save/edit opens the named-mark editor. Saved marks have a dedicated searchable panel and GeoJSON backup.

## Data maintenance and limits

- Weather/marine: [Open-Meteo](https://open-meteo.com/), [marine documentation](https://open-meteo.com/en/docs/marine-weather-api), [licences](https://open-meteo.com/en/licence). Model data, not observations. Partial data remains missing; unknown values never pass the trip filters. Last-downloaded forecasts are labelled offline/stale; trip suggestions are disabled when stale.
- Tides: [Toitū Te Whenua LINZ published predictions](https://www.linz.govt.nz/products-services/tides-and-tidal-streams/tide-predictions), CC BY 4.0. Each bundled table records its source CSV and constituent reference. Local time includes daylight saving; heights are above the port chart datum. The app transforms the supplied extrema without interpolating a continuous tide curve. Nearest-port distances are geographical, not a claim that a port represents another harbour. Weather effects and local offsets are not applied. Downloaded predictions are not official tide tables for statutory navigation.
- Update tides deliberately with `node scripts/update-tides.mjs 2026 2027` (internet required), review changed data, test, and commit. Add future years before expiry. Do not silently extrapolate beyond supplied tables.
- Reference chart: [LINZ NZ 53, Bream Head to Slipper Island including Hauraki Gulf / Tīkapa Moana](https://data.linz.govt.nz/layer/51247-chart-nz-53-bream-head-to-slipper-island-including-hauraki-gulf-tikapa-moana/), CC BY 4.0, compilation scale 1:200,000. The source KML reports data updated **13 January 2022**, downloaded **18 April 2023**. It is a dated reference chart, not a current or corrected ENC. Its date and use restriction remain visible on the map. The archive is publicly hosted at [ArcGIS item c7f9914885b84b409226cdeeb6108fc4](https://www.arcgis.com/home/item.html?id=c7f9914885b84b409226cdeeb6108fc4), with original LINZ provenance and licence inside. The app verifies its SHA-256 before decoding, ignores embedded HTML, and retains each image's KML geographic bounds. Approximately 10 MB downloads on first use; subsequent visits reuse the device cache where available. Only visible chart images are mounted and decoded. The chart is not bundled in the APK; first use needs internet. This key-free layer covers the included NZ 53 extent only. Outside it, the app explicitly reports the coverage gap and shows the coast map.
- Other chart sheets: [LINZ LDS web service documentation](https://www.linz.govt.nz/guidance/data-service/linz-data-service-guide/map-tile-services/lds-web-map-tile-service-specifications). The deployed relay serves current LDS WMTS tile requests for 221 allowlisted NZ chart sheets. The layer catalogue was checked on 28 October 2026; this is not a chart correction date. Raster imagery is reference material and does not verify chart corrections. Internet is required for these tiles; the app does not bulk-download them.
- Background map: [OpenStreetMap](https://www.openstreetmap.org/copyright) and optional [OpenSeaMap](https://www.openseamap.org/). Distance measurements do not avoid land or hazards. Use current [LINZ charts](https://charts.linz.govt.nz/) for navigation. Background tiles are fetched only for the displayed viewport, never predownloaded for offline use.
- Official weather warnings, fishing rules and navigational notices are external links; they are not ingested or checked automatically. An absence of an app alert does not mean no warnings exist.
- Before a public/commercial launch, confirm provider quotas/terms, chart licensing, privacy copy, API resilience and native device behaviour. No advertising or analytics is included.

## Next development

Current nationwide ENC integration and verified chart corrections; official warning ingestion; additional tide stations and reviewed secondary-port offsets; native device testing and release signing; optional cross-device sync; radar and model comparison. These are future work, not enabled baseline features.
