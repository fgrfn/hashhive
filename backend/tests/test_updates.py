"""Tests for the update-check version logic (rolling tags vs real releases)."""
import os
import sys
import tempfile
from pathlib import Path

_tmpdir = tempfile.mkdtemp()
os.environ.setdefault("HASHHIVE_DATA_DIR", _tmpdir)
(Path(_tmpdir) / "logs").mkdir(parents=True, exist_ok=True)

sys.path.insert(0, str(Path(__file__).parent.parent))

from routers.updates import _channel, _parse_semver, _update_available  # noqa: E402


def test_channel_detects_rolling_tags():
    for tag in ("latest", "dev", "DEV", "edge", "nightly", "main"):
        assert _channel(tag) == "rolling"
    for tag in ("2.6.10", "v2.6.10", "1.0.0"):
        assert _channel(tag) == "release"


def test_parse_semver():
    assert _parse_semver("2.6.10") == (2, 6, 10)
    assert _parse_semver("v2.6.10") == (2, 6, 10)
    assert _parse_semver("2.6.10-1") == (2, 6, 10)
    assert _parse_semver("latest") is None
    assert _parse_semver("dev") is None
    assert _parse_semver("") is None


def test_rolling_tag_is_never_flagged_outdated():
    # The :latest image reports version "latest" — must NOT be called outdated.
    assert _update_available("latest", "2.6.10") is False
    assert _update_available("dev", "2.6.10") is False


def test_real_release_behind_is_update():
    assert _update_available("2.6.0", "2.6.10") is True
    assert _update_available("v2.5.0", "2.6.10") is True


def test_same_or_ahead_is_not_update():
    assert _update_available("2.6.10", "2.6.10") is False
    assert _update_available("2.7.0", "2.6.10") is False  # ahead of release
