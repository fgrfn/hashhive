"""Application version resolution."""

import subprocess

from .paths import BASE_DIR


def _resolve_version() -> str:
    # 1. git describe (works for native installs with git history)
    try:
        result = subprocess.run(
            ["git", "describe", "--tags", "--abbrev=0"],
            capture_output=True, text=True, cwd=BASE_DIR.parent, timeout=3,
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip().lstrip("v")
    except Exception:
        pass
    # 2. version.txt (written by CI before Docker build)
    try:
        return (BASE_DIR.parent / "version.txt").read_text().strip()
    except Exception:
        pass
    return "dev"


APP_VERSION = _resolve_version()
