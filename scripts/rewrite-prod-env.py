#!/usr/bin/env python3
"""Rewrite Droplet .env: keep known values, drop obsolete keys, add missing ones.

Never prints secret values. Writes a backup next to the file.
"""

from __future__ import annotations

import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

KEEP_OR_ADD = [
    "DATABASE_URL",
    "REDIS_URL",
    "KITE_API_KEY",
    "KITE_API_SECRET",
    "ALLOWED_KITE_USER_ID",
    "NODE_ENV",
    "PORT",
    "TZ",
    "NEXT_PUBLIC_APP_URL",
    "NEXT_PUBLIC_DEFAULT_LOTS",
    "NEXT_PUBLIC_DEFAULT_SKEW_PERCENT",
    "NEXT_PUBLIC_DEFAULT_SQUARE_OFF_TIME",
    "NEXT_PUBLIC_DEFAULT_SLM_PERCENT",
    "SECRET_COOKIE_PASSWORD",
    "SESSION_COOKIE_SECURE",
    "MOCK_ORDERS",
    "HEALTH_CHECK_TOKEN",
    "BIND_HOST",
    "OTEL_EXPORTER_OTLP_ENDPOINT",
    "OTEL_EXPORTER_OTLP_HEADERS",
]

# New keys that should exist even if absent. Values only if we must invent them.
DEFAULTS = {
    "NODE_ENV": "production",
    "PORT": "3000",
    "TZ": "Asia/Kolkata",
    "SESSION_COOKIE_SECURE": "true",
    "MOCK_ORDERS": "true",
}

# Never invent these; they must already exist.
REQUIRED_EXISTING = (
    "DATABASE_URL",
    "REDIS_URL",
    "KITE_API_KEY",
    "KITE_API_SECRET",
    "SECRET_COOKIE_PASSWORD",
    "NEXT_PUBLIC_APP_URL",
    "ALLOWED_KITE_USER_ID",
)


def parse_env(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key:
            out[key] = value
    return out


def main() -> int:
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "/srv/khaching/app/.env")
    if not path.is_file():
        print("FILE=missing")
        return 1

    existing = parse_env(path.read_text(encoding="utf-8"))
    before = sorted(existing)
    removed = [k for k in before if k not in KEEP_OR_ADD]
    added: list[str] = []
    kept: list[str] = []

    for key in REQUIRED_EXISTING:
        if not str(existing.get(key, "")).strip():
            print(f"REQUIRED_MISSING={key}")
            return 1

    merged: dict[str, str] = {}
    for key in KEEP_OR_ADD:
        if key in existing and str(existing[key]).strip() != "":
            merged[key] = existing[key]
            kept.append(key)
        elif key in DEFAULTS:
            merged[key] = DEFAULTS[key]
            added.append(key)
        # optional OTEL keys: keep only if already set

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    backup = path.with_name(f".env.bak.{stamp}")
    shutil.copy2(path, backup)

    lines = [
        "# kha-ching production. Do not commit.",
        "# Infra and secrets retained from previous file.",
        "",
        "# --- Postgres / Redis (compose may override hostnames) ---",
        f"DATABASE_URL={merged['DATABASE_URL']}",
        f"REDIS_URL={merged['REDIS_URL']}",
        "",
        "# --- Kite ---",
        f"KITE_API_KEY={merged['KITE_API_KEY']}",
        f"KITE_API_SECRET={merged['KITE_API_SECRET']}",
        f"ALLOWED_KITE_USER_ID={merged['ALLOWED_KITE_USER_ID']}",
        "",
        "# --- Runtime ---",
        f"NODE_ENV={merged['NODE_ENV']}",
        f"PORT={merged['PORT']}",
        f"TZ={merged['TZ']}",
        f"NEXT_PUBLIC_APP_URL={merged['NEXT_PUBLIC_APP_URL']}",
        f"NEXT_PUBLIC_DEFAULT_LOTS={merged.get('NEXT_PUBLIC_DEFAULT_LOTS', '2')}",
        f"NEXT_PUBLIC_DEFAULT_SKEW_PERCENT={merged.get('NEXT_PUBLIC_DEFAULT_SKEW_PERCENT', '10')}",
        f"NEXT_PUBLIC_DEFAULT_SQUARE_OFF_TIME={merged.get('NEXT_PUBLIC_DEFAULT_SQUARE_OFF_TIME', '15:20')}",
        f"NEXT_PUBLIC_DEFAULT_SLM_PERCENT={merged.get('NEXT_PUBLIC_DEFAULT_SLM_PERCENT', '30')}",
        f"SECRET_COOKIE_PASSWORD={merged['SECRET_COOKIE_PASSWORD']}",
        f"SESSION_COOKIE_SECURE={merged['SESSION_COOKIE_SECURE']}",
        f"MOCK_ORDERS={merged['MOCK_ORDERS']}",
    ]
    if "HEALTH_CHECK_TOKEN" in merged:
        lines.append(f"HEALTH_CHECK_TOKEN={merged['HEALTH_CHECK_TOKEN']}")
    if "BIND_HOST" in merged:
        lines.append(f"BIND_HOST={merged['BIND_HOST']}")
    if "OTEL_EXPORTER_OTLP_ENDPOINT" in merged:
        lines.extend(
            [
                "",
                "# --- Observability ---",
                f"OTEL_EXPORTER_OTLP_ENDPOINT={merged['OTEL_EXPORTER_OTLP_ENDPOINT']}",
            ]
        )
        if "OTEL_EXPORTER_OTLP_HEADERS" in merged:
            lines.append(f"OTEL_EXPORTER_OTLP_HEADERS={merged['OTEL_EXPORTER_OTLP_HEADERS']}")
    lines.append("")

    path.write_text("\n".join(lines), encoding="utf-8")

    print(f"BACKUP={backup.name}")
    print("KEPT=" + ",".join(kept))
    print("ADDED=" + (",".join(added) if added else "none"))
    print("REMOVED=" + (",".join(removed) if removed else "none"))
    print("FILE=rewritten")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
