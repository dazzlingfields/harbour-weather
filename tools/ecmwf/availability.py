"""Check the latest open IFS run using metadata only; no GRIB download."""
import json
from ecmwf.opendata import Client

client = Client(source="aws", model="ifs", resol="0p25")
run = client.latest(type="fc", step=0)
print(json.dumps({"model": "ECMWF IFS", "source": "ECMWF open data / AWS mirror", "resolution": "0.25 degrees", "latest_run_utc": run.isoformat() + "Z"}))
