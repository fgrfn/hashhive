"""Tests for the NMMiner (lottominer) driver against the real API shapes."""
import asyncio
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock

_tmpdir = tempfile.mkdtemp()
os.environ.setdefault("HASHHIVE_DATA_DIR", _tmpdir)
(Path(_tmpdir) / "logs").mkdir(parents=True, exist_ok=True)

sys.path.insert(0, str(Path(__file__).parent.parent))

from miners.lottominer import LOTTO_ACTION_MAP, _normalize_info, probe_lottominer  # noqa: E402


def _resp(status, payload):
    return type("R", (), {"status_code": status, "json": lambda self: payload})()


def test_restart_uses_real_endpoint():
    assert LOTTO_ACTION_MAP["restart"] == "/api/system/restart"


def test_probe_detects_nmminer_by_model():
    client = AsyncMock()
    client.get = AsyncMock(return_value=_resp(200, {"model": "NMMiner", "hostname": "nm1", "hr": 5000, "ver": "0.4"}))
    rec = asyncio.run(probe_lottominer("192.168.1.50", client))
    assert rec and rec["type"] == "lottominer_device"
    assert rec["name"] == "nm1"


def test_probe_rejects_non_nmminer():
    client = AsyncMock()
    client.get = AsyncMock(return_value=_resp(200, {"foo": "bar"}))
    assert asyncio.run(probe_lottominer("192.168.1.51", client)) is None


def test_probe_detects_nmminer_via_system_info_fallback():
    """Firmware (e.g. v2.0.02) that doesn't serve /probe is still found via
    /api/system/info (identity.hwModel == NMMiner)."""
    async def _get(url, **kwargs):
        if url.endswith("/probe"):
            return _resp(404, {})
        if url.endswith("/api/system/info"):
            return _resp(200, {"identity": {"hwModel": "NMMiner", "hostName": "NMMiner5_688FB8",
                                            "fwVersion": "v2.0.02"}})
        return _resp(404, {})

    client = AsyncMock()
    client.get = AsyncMock(side_effect=_get)
    rec = asyncio.run(probe_lottominer("10.10.40.92", client))
    assert rec and rec["type"] == "lottominer_device"
    assert rec["name"] == "NMMiner5_688FB8"
    assert rec["model"] == "NMMiner"
    assert rec["version"] == "v2.0.02"


def test_probe_fallback_ignores_wroomminer_compat_shim():
    """WroomMiner ships an /api/system/info compat shim (model "WroomMiner") —
    the NMMiner fallback must not claim it."""
    async def _get(url, **kwargs):
        if url.endswith("/probe"):
            return _resp(404, {})
        return _resp(200, {"identity": {"model": "WroomMiner"}, "compatible_with": "HashHive"})

    client = AsyncMock()
    client.get = AsyncMock(side_effect=_get)
    assert asyncio.run(probe_lottominer("10.10.40.93", client)) is None


def test_normalize_info_maps_fields():
    info = {
        "identity": {"hwModel": "NMMiner", "hostName": "garage-nm", "fwVersion": "0.4.2", "rssi": -55},
        "miner": {"hashRate": 0.0042, "sAccepted": 12, "sRejected": 1, "uptimeSeconds": 3600,
                  "bestDiffEver": 1.23e10, "lastDiff": 5000},
        "stratum": {"url": "stratum+tcp://pool:3333", "user": "bc1q.worker"},
        "temps": {"asic": 48, "vcore": 40},
    }
    d = _normalize_info("192.168.1.50", "garage-nm", None, info)
    assert d["_online"] is True
    assert d["GHs"] == 0.0042 and d["hashrate"] == 0.0042
    assert d["temp"] == 48
    assert d["pool"] == "stratum+tcp://pool:3333"
    assert d["worker"] == "bc1q.worker"
    assert d["bestDiff"] == 1.23e10
    assert d["shares_ok"] == 12 and d["shares_err"] == 1
    assert d["version"] == "0.4.2"


def test_device_config_post_routes_fields_to_correct_endpoints():
    """Each settings group must POST to its own NMMiner endpoint, unknown keys dropped."""
    import asyncio as _asyncio
    from unittest.mock import patch
    from routers import lottominer as lm

    posts: dict[str, list] = {}

    async def run():
        client = AsyncMock()

        async def _post(url, json=None):
            posts[url.split("/api/")[-1]] = sorted(json.keys())
            return _resp(200, {})
        client.post = _post
        with patch("routers.lottominer.httpx.AsyncClient") as M:
            M.return_value.__aenter__.return_value = client
            await lm.post_lottominer_device_config({
                "ip": "192.168.1.50",
                "PrimaryPool": "p", "PrimaryAddress": "a", "PrimaryPassword": "x",
                "Hostname": "nm1", "WiFiSSID": "net", "WiFiPWD": "pw",
                "Timezone": "1", "TimeFormat": 24, "DateFormat": "YYYY-MM-DD",
                "Brightness": 80, "RotateScreen": 90, "LedEnable": 1, "ScreenSaver": "5m",
                "MainCoin": "BTC", "WatchCoins": "BTC,ETH", "PricePageMode": "kline",
                "WeatherCity": "Berlin", "WeatherLat": "52.52", "WeatherTempUnit": "celsius",
                "bogus": "ignored",
            })

    _asyncio.run(run())
    assert posts["setting/mining"] == ["PrimaryAddress", "PrimaryPassword", "PrimaryPool"]
    assert posts["setting/network"] == ["Hostname", "WiFiPWD", "WiFiSSID"]
    assert posts["setting/time"] == ["DateFormat", "TimeFormat", "Timezone"]
    assert posts["setting/preference"] == ["Brightness", "LedEnable", "RotateScreen", "ScreenSaver"]
    assert posts["setting/market"] == ["MainCoin", "PricePageMode", "WatchCoins"]
    assert posts["setting/weather"] == ["WeatherCity", "WeatherLat", "WeatherTempUnit"]
    # "bogus" never reaches any endpoint
    assert all("bogus" not in keys for keys in posts.values())


def test_device_config_post_syncs_stored_name_to_hostname():
    """Changing the Hostname in the config modal updates HashHive's stored
    device label so the new name shows after the next refresh."""
    import asyncio as _asyncio
    from unittest.mock import patch
    from routers import lottominer as lm

    cfg = {"lottominer_devices": [{"ip": "192.168.1.50", "name": "old-name"}]}

    async def run():
        client = AsyncMock()
        client.post = AsyncMock(return_value=_resp(200, {}))
        saved = {}

        def _load(_path, _default):
            return cfg

        def _save(_path, data):
            saved["cfg"] = data

        with patch("routers.lottominer.httpx.AsyncClient") as M, \
             patch("routers.lottominer.load_json", _load), \
             patch("routers.lottominer.save_json", _save):
            M.return_value.__aenter__.return_value = client
            await lm.post_lottominer_device_config({"ip": "192.168.1.50", "Hostname": "garage-nm"})
        return saved

    saved = _asyncio.run(run())
    assert saved["cfg"]["lottominer_devices"][0]["name"] == "garage-nm"


def test_fanout_restart_sends_json_body():
    """NMMiner restart needs an application/json body or it replies 405 — the
    POST must include json={} so httpx sets the Content-Type."""
    import asyncio
    from unittest.mock import patch
    from miners import lottominer as lm

    calls = []

    async def run():
        client = AsyncMock()

        async def _post(url, json=None):
            calls.append((url, json))
            return _resp(200, {})
        client.post = _post
        with patch("miners.lottominer.httpx.AsyncClient") as M:
            M.return_value.__aenter__.return_value = client
            return await lm.lottominer_fanout("restart", ["192.168.1.50"])

    res = asyncio.run(run())
    assert res[0]["status"] == 200
    assert calls == [("http://192.168.1.50/api/system/restart", {})]


def test_plausible_ghs_scales_misreported_units():
    from miners.lottominer import _plausible_ghs
    # Firmware that reports ~10 MH/s as 10140 (kH/s-ish) assumed GH/s → scaled down
    assert abs(_plausible_ghs(10140) - 0.01014) < 1e-9      # 10.14 MH/s
    assert _plausible_ghs(5000) == 0.005                     # 5 MH/s
    assert _plausible_ghs(5) == 0.005                        # 5 "GH/s" → 5 MH/s
    # Correct tiny GH/s values are left untouched
    assert _plausible_ghs(0.00104) == 0.00104               # 1.04 MH/s
    assert _plausible_ghs(0) == 0.0
    assert _plausible_ghs(None) is None


def test_normalize_info_normalizes_hashrate():
    info = {"identity": {"hostName": "nm", "fwVersion": "0.1.0"},
            "miner": {"hashRate": 10140}, "stratum": {}, "temps": {}}
    d = _normalize_info("10.0.0.1", "nm", None, info)
    assert abs(d["GHs"] - 0.01014) < 1e-9   # not 10140 GH/s


def test_normalize_info_real_nmminer_v2():
    """Real GET /api/system/info from firmware v2.0.02 (ESP32, ~1.04 MH/s).

    This firmware reports hashRate correctly in GH/s as a tiny float, so the
    plausibility heuristic must leave it untouched (it's below the ceiling)."""
    info = {
        "identity": {"hwModel": "NMMiner", "hostName": "NMMiner5_688FB8",
                     "fwVersion": "v2.0.02", "rssi": -71},
        "miner": {"hashRate": 0.001042244, "sAccepted": 1, "sRejected": 0,
                  "uptimeSeconds": 536, "uptimeEver": 117536,
                  "lastDiff": "0.4469 ", "bestDiffEver": "13.340 "},
        "stratum": {"url": "eu.digi.hmpool.io:3337",
                    "user": "dgb1qgadc953sk6dj8a87yz6keu5qy5zs3wuc27kvl0"},
        "temps": {"vcore": None, "asic": None},
    }
    d = _normalize_info("10.10.40.92", "nm5", None, info)
    # hashRate is already GH/s and below the ceiling → passed through unchanged
    assert d["GHs"] == 0.001042244
    assert d["GHs5s"] == 0.001042244
    assert d["hashrate"] == 0.001042244
    assert d["online"] is True and d["_online"] is True
    assert d["hostname"] == "NMMiner5_688FB8"
    assert d["version"] == "v2.0.02"
    assert d["pool"] == "eu.digi.hmpool.io:3337"
    assert d["shares_ok"] == 1 and d["shares_err"] == 0
    assert d["rssi"] == -71
    # No temp sensor reported by this variant → temp stays None
    assert d["temp"] is None
