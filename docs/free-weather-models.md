# Free weather and marine models for New Zealand

Reviewed 28 October 2026. The current app uses independent forecast centres through **one delivery service, Open-Meteo**. Switching a model changes the forecast, not the API provider. None of these options is an observed local harbour measurement.

| Selectable wind/weather model | Coverage and purpose | Access |
| --- | --- | --- |
| ECMWF IFS | Global, including NZ; useful for synoptic wind, pressure and weather. The selected Open-Meteo IFS product has an approximately 9 km grid. | Open-Meteo model `ecmwf_ifs`; direct ECMWF open-data files are also available. |
| NOAA GFS | Global, including NZ; a second forecast centre for comparison. The selected grid is 0.25°. | Open-Meteo `gfs_global`; NOAA publishes GRIB2 files through NOMADS and open-data mirrors. |
| DWD ICON | Global, including NZ; a third forecast centre. The global model is distinct from Europe-only ICON-EU/D2 products. | Open-Meteo `icon_global`; DWD publishes open model output. |
| Best match | Provider-selected models for the location. This can share models with the named choices. | Default; no claim that it is an independent fourth forecast. |

| Selectable wave model | Main fields used | Complementary fields |
| --- | --- | --- |
| ECMWF WAM | Wave height, direction and period | Missing swell, water temperature and currents use marine best match. |
| NOAA GFS Wave 0.25° | Waves and swell | Missing water temperature and currents use marine best match. |
| Météo-France Wave / MFWAM | Waves and swell; approximately 8 km, native 3-hourly output | Missing water temperature and currents use marine best match. |
| Marine best match | Available waves, swell, water temperature and offshore currents | Provider selects the relevant wave/ocean products. |

The app requests hourly output. Some native model steps are coarser and interpolated by the provider. An hourly column is not an independent hourly model run. Grid size is not a guarantee of harbour or bar accuracy.

## Field provenance and missing data

The selected model keeps every available value. Only explicitly allowed missing auxiliary fields are supplemented. Values are joined by UTC timestamp, never array position. Each filled value records `row.supplemented[field]`; source names, model identifiers, auxiliary grid locations and the download time are saved with each forecast. Caches are separated by coordinate **and** wind/wave model pair.

Supplemented table rows have an asterisk. **Forecast models → Field sources** explains them. Core wind, gust and wave values are not silently replaced if their selected model fails. A missing auxiliary request leaves a dash. Best-match additions must not be counted later as independent model evidence.

Live NZ tests covered all four wind choices and four wave choices. A combined ICON/WAM request was checked with supplied swell, water temperature, currents and visibility. Missing-field behaviour varies by location/run; availability is checked in the response.

## What “free” means

Open-Meteo's hosted free API is for non-commercial use, subject to its current limits (under 10,000 calls/day, 5,000/hour and 600/minute). Private/non-profit apps without subscriptions or advertising qualify under its examples. Model switches can request complementary data; the app debounces map taps and reuses forecasts for 15 minutes to reduce calls. Refresh explicitly requests new data.

The underlying open datasets have their own licences and attribution. For example, ECMWF's open IFS/AIFS subset is CC BY 4.0 and can be redistributed commercially with attribution. That does **not** make Open-Meteo's free hosted API a commercial service. Direct ingestion needs GRIB decoding, spatial extraction, caching and monitoring; hosting/processing can have costs.

MetService/MetOcean offers relevant NZ forecasts and observations, but its API requires credentials and its access conditions must be arranged. It has not been represented as a free integrated source. Public weather-app pages are not scraped.

## Direct ECMWF Python groundwork

`ecmwf-opendata==0.3.35` was installed in the task's Python environment. Reproduce with:

```sh
python -m venv .venv
.venv/bin/python -m pip install -r tools/ecmwf/requirements.txt
.venv/bin/python tools/ecmwf/availability.py
```

On Windows, use `.venv\Scripts\python.exe`. The availability check uses the public AWS mirror and downloads metadata only. It successfully found the IFS run at **2026-10-28 00:00 UTC**. The Python client belongs in a future ingestion service; the current APK uses the web forecast API. Bulk global GRIB files are not bundled with the APK.

## Confidence work for a later release

Keep native issue/run times separately from download times. Add ensemble members and a reviewed set of NZ station/buoy observations. Verify reliability by location, lead time and variable before assigning probabilities. Shared model ancestry, wind-driven wave products and best-match reuse create correlated errors; counting agreeing models would overstate confidence. Model spread can be displayed as disagreement, but should not be labelled a calibrated confidence percentage without validation. No confidence score is generated in this release.

## Primary sources

- [ECMWF open data and licences](https://www.ecmwf.int/en/forecasts/datasets/open-data)
- [ECMWF's Python client](https://github.com/ecmwf/ecmwf-opendata)
- [NOAA GFS data](https://www.ncei.noaa.gov/products/weather-climate-models/global-forecast) and [NOMADS](https://nomads.ncep.noaa.gov/)
- [DWD ICON documentation](https://open-meteo.com/en/docs/dwd-api) and [DWD open-data server](https://opendata.dwd.de/weather/nwp/)
- [Open-Meteo weather](https://open-meteo.com/en/docs), [marine](https://open-meteo.com/en/docs/marine-weather-api) and [free API terms](https://open-meteo.com/en/terms)
- [MetService API catalogue](https://developer.metservice.com/docs/api-catalog/) and [authentication](https://developer.metservice.com/docs/auth/)
