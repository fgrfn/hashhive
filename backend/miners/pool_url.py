"""Shared stratum pool-URL parsing/normalization for miner drivers.

Pool presets store the endpoint as a single string that may or may not carry a
scheme and/or port::

    public-pool.io
    public-pool.io:3333
    stratum+tcp://public-pool.io:3333
    stratum+ssl://pool.example:443

Miner families consume that string in incompatible shapes, which is why a raw
preset URL pushed verbatim broke some devices:

* **AxeOS** (BitAxe / NerdAxe): host in ``stratumURL`` (no scheme, no port) and
  the port in a *separate* ``stratumPort`` field. Shipping ``host:port`` (or a
  ``stratum+tcp://`` scheme) in ``stratumURL`` leaves the port field stale and
  the device can't connect.
* **NMMiner**: a single ``stratum+tcp://host:port`` line. A bare ``host:port``
  makes its resolver fail with DNS errors, and a scheme without a port is
  equally unusable.
* **WroomMiner / AxeHub**: host and port in separate JSON fields, scheme stripped.

This module parses any of those forms once and re-emits exactly the shape each
family needs, so the push path never ships a malformed endpoint again.
"""

from dataclasses import dataclass

DEFAULT_STRATUM_PORT = 3333

# Schemes that imply an encrypted (TLS/SSL) stratum connection.
_TLS_SCHEMES = {"stratum+ssl", "stratum+tls", "ssl", "tls"}


@dataclass
class PoolEndpoint:
    """A parsed stratum endpoint, re-emittable in any family's expected shape."""

    host: str = ""
    port: int = 0
    tls: bool = False
    scheme: str = ""  # original scheme without "://", e.g. "stratum+tcp"

    @property
    def host_port(self) -> str:
        """``host:port`` (or bare host when no port is known)."""
        return f"{self.host}:{self.port}" if self.host and self.port else self.host

    def stratum_url(self, default_port: int = DEFAULT_STRATUM_PORT) -> str:
        """Full single-line URL (NMMiner): ``scheme://host:port``.

        Always includes a port — NMMiner's resolver needs one — falling back to
        ``default_port`` when the source string carried none. The original
        scheme is preserved so ``stratum+ssl://`` (TLS) survives the round-trip.
        """
        if not self.host:
            return ""
        scheme = self.scheme or ("stratum+ssl" if self.tls else "stratum+tcp")
        port = self.port or default_port
        return f"{scheme}://{self.host}:{port}"


def parse_pool_endpoint(raw: str, default_port: int | None = None) -> PoolEndpoint:
    """Parse a pool-URL string (with or without scheme/port) into its parts.

    ``default_port`` fills in the port when the string carries none; pass it as
    the family's stratum default (or a preset's explicit port field).
    """
    raw = (raw or "").strip()
    if not raw:
        return PoolEndpoint(port=int(default_port or 0))

    scheme = ""
    rest = raw
    if "://" in raw:
        scheme, _, rest = raw.partition("://")
        scheme = scheme.strip().lower()

    # Drop any path/query an endpoint string might carry, keep host[:port].
    rest = rest.strip().strip("/").split("/")[0]

    host, sep, port_s = rest.rpartition(":")
    if sep and port_s.isdigit():
        port = int(port_s)
    else:
        host = rest
        port = int(default_port or 0)

    return PoolEndpoint(host=host, port=port, tls=scheme in _TLS_SCHEMES, scheme=scheme)
