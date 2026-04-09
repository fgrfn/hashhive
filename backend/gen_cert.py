"""Generate a self-signed TLS certificate for local HTTPS use.

Usage:
    python gen_cert.py <cert_path> <key_path>
"""

import ipaddress as _ipaddress
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path


def generate(cert_path: str, key_path: str) -> None:
    try:
        from cryptography import x509
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.x509.oid import NameOID
    except ImportError:
        print("ERROR: 'cryptography' package not installed. Run: pip install cryptography")
        sys.exit(1)

    print("Generating 2048-bit RSA key and self-signed certificate …")

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, "hashhive"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "HashHive"),
    ])

    now = datetime.now(timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now)
        .not_valid_after(now + timedelta(days=3650))  # 10 years
        .add_extension(
            x509.SubjectAlternativeName([
                x509.DNSName("localhost"),
                x509.DNSName("hashhive"),
                x509.IPAddress(_ipaddress.IPv4Address("127.0.0.1")),
            ]),
            critical=False,
        )
        .add_extension(
            x509.BasicConstraints(ca=True, path_length=None),
            critical=True,
        )
        .sign(key, hashes.SHA256())
    )

    Path(key_path).parent.mkdir(parents=True, exist_ok=True)
    Path(cert_path).parent.mkdir(parents=True, exist_ok=True)

    with open(key_path, "wb") as f:
        f.write(key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.TraditionalOpenSSL,
            serialization.NoEncryption(),
        ))

    with open(cert_path, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))

    print(f"  Certificate : {cert_path}")
    print(f"  Private key : {key_path}")
    print("  Valid for   : 10 years")
    print("  NOTE: Self-signed – browser will show a security warning.")
    print("        Import the certificate into your browser/OS trust store")
    print("        to remove the warning.")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <cert.pem> <key.pem>")
        sys.exit(1)
    generate(sys.argv[1], sys.argv[2])
