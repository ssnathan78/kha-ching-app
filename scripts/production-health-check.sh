#!/usr/bin/env bash
# SAFE / READ-ONLY — production diagnostic. Does not change the system.
# Does not print secrets, private keys, tokens, or credential URLs.
#
# On the Droplet:
#   bash scripts/production-health-check.sh
# From a laptop (after ~/.ssh/config Host kha-ching-prod):
#   ssh -o BatchMode=yes kha-ching-prod "bash -s" < scripts/production-health-check.sh

set -euo pipefail

APP_DIR_CANDIDATES=(
  "${KHA_CHING_APP_DIR:-}"
  /srv/khaching/app
  /opt/kha-ching-app
  /app
  "$(pwd)"
)

echo "=== kha-ching production health (read-only) ==="
echo "generated_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo

section() {
  echo
  echo "--- $1 ---"
}

have() { command -v "$1" >/dev/null 2>&1; }

awk_fallback() {
  echo "python3 missing; skipped env key scan"
}

section "OS"
if [[ -f /etc/os-release ]]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  echo "distro=${NAME:-unknown} version=${VERSION_ID:-unknown}"
fi
echo "kernel=$(uname -srm)"
echo "hostname=$(hostname)"
echo "uptime=$(uptime -p 2>/dev/null || uptime)"

section "Resources"
if have nproc; then echo "cpu_cores=$(nproc)"; fi
if have lscpu; then lscpu | awk '/^Model name:|^CPU\(s\):|^Thread/' || true; fi
if have free; then free -h; fi
echo
df -hT -x tmpfs -x devtmpfs -x squashfs 2>/dev/null || df -h
echo
if have loadavg || [[ -r /proc/loadavg ]]; then echo "loadavg=$(cat /proc/loadavg)"; fi

section "Listening TCP (host)"
if have ss; then
  ss -lnt | awk 'NR==1 || $4 ~ /:(22|80|443|3000|5432|6379)$/'
elif have netstat; then
  netstat -lnt 2>/dev/null | awk 'NR==1 || $4 ~ /:(22|80|443|3000|5432|6379)$/'
else
  echo "ss/netstat not available"
fi

section "Firewall hints"
if have ufw; then
  ufw status verbose 2>/dev/null || echo "ufw present but status requires privileges"
else
  echo "ufw=not_installed"
fi
if have fail2ban-client; then
  fail2ban-client status 2>/dev/null || echo "fail2ban present but status requires privileges"
else
  echo "fail2ban=not_installed"
fi

section "SSH daemon (sshd -T excerpts; no keys)"
if have sshd && [[ -r /etc/ssh/sshd_config ]]; then
  sshd -T 2>/dev/null | awk '
    $1=="passwordauthentication" ||
    $1=="permitrootlogin" ||
    $1=="pubkeyauthentication" ||
    $1=="kbdinteractiveauthentication" ||
    $1=="challengeresponseauthentication" ||
    $1=="maxauthtries" { print }
  ' || echo "sshd -T not readable (need privileges)"
else
  echo "sshd config not readable from this user"
fi

section "Runtime"
if have node; then echo "node=$(node -v)"; else echo "node=not_on_path"; fi
if have yarn; then echo "yarn=$(yarn -v 2>/dev/null || true)"; else echo "yarn=not_on_path"; fi
if have docker; then echo "docker=$(docker --version 2>/dev/null || true)"; else echo "docker=not_on_path"; fi
if have nginx; then echo "nginx=$(nginx -v 2>&1 || true)"; else echo "nginx=not_on_path"; fi
if have caddy; then echo "caddy=$(caddy version 2>/dev/null || true)"; else echo "caddy=not_on_path"; fi

section "Process manager / containers"
if have systemctl; then
  for unit in kha-ching nginx caddy postgresql redis-server redis docker; do
    if systemctl list-unit-files "${unit}.service" >/dev/null 2>&1; then
      echo "systemd ${unit}=$(systemctl is-active "$unit" 2>/dev/null || echo unknown) enabled=$(systemctl is-enabled "$unit" 2>/dev/null || echo unknown)"
    fi
  done
fi
if have docker; then
  docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || echo "docker ps requires privileges"
fi

APP_DIR=""
for cand in "${APP_DIR_CANDIDATES[@]}"; do
  [[ -z "$cand" ]] && continue
  if [[ -f "$cand/server.js" && -f "$cand/package.json" ]]; then
    APP_DIR="$cand"
    break
  fi
done
echo "app_dir=${APP_DIR:-not_found}"

section "Application flags (non-secret only)"
ENV_FILE=""
if [[ -n "$APP_DIR" && -f "$APP_DIR/.env" ]]; then
  ENV_FILE="$APP_DIR/.env"
elif [[ -f /opt/kha-ching-app/.env ]]; then
  ENV_FILE=/opt/kha-ching-app/.env
fi

if [[ -n "$ENV_FILE" ]]; then
  echo "env_file=present"
  python3 - "$ENV_FILE" <<'PY' 2>/dev/null || awk_fallback "$ENV_FILE"
import re, sys
path = sys.argv[1]
safe = {"NODE_ENV", "MOCK_ORDERS", "SESSION_COOKIE_SECURE", "TZ", "PORT", "BIND_HOST"}
presence = {
    "DATABASE_URL", "REDIS_URL", "SECRET_COOKIE_PASSWORD",
    "KITE_API_KEY", "KITE_API_SECRET", "ALLOWED_KITE_USER_ID",
    "HEALTH_CHECK_TOKEN", "OTEL_EXPORTER_OTLP_ENDPOINT", "NEXT_PUBLIC_APP_URL",
}
seen = {k: False for k in safe | presence}
values = {}
with open(path, "r", encoding="utf-8", errors="replace") as fh:
    for raw in fh:
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        key = key.strip()
        if key in seen:
            seen[key] = True
        if key in safe:
            values[key] = val.strip().strip('"').strip("'")
        if key == "NEXT_PUBLIC_APP_URL":
            from urllib.parse import urlparse
            v = val.strip().strip('"').strip("'")
            parsed = urlparse(v)
            host = parsed.hostname or "unparsed"
            values["NEXT_PUBLIC_APP_URL_scheme_host"] = f"{parsed.scheme}://{host}"
for k in sorted(safe):
    print(f"{k}={values.get(k, 'missing')}")
print(f"NEXT_PUBLIC_APP_URL_scheme_host={values.get('NEXT_PUBLIC_APP_URL_scheme_host', 'missing')}")
for k in sorted(presence):
    if k == "NEXT_PUBLIC_APP_URL":
        continue
    print(f"{k}={'configured' if seen.get(k) else 'missing'}")
PY
else
  echo "env_file=missing"
fi

section "Local health endpoint"
if have curl; then
  code=$(curl -sS -o /tmp/kha-ching-health.json -w "%{http_code}" --max-time 8 "http://127.0.0.1:3000/api/health" || echo "000")
  echo "GET /api/health http_status=${code}"
  if [[ -f /tmp/kha-ching-health.json ]]; then
    python3 - <<'PY' 2>/dev/null || cat /tmp/kha-ching-health.json
import json
try:
    data = json.load(open("/tmp/kha-ching-health.json", encoding="utf-8"))
    print("status=", data.get("status"))
    print("checks=", data.get("checks"))
    print("service=", data.get("service"))
except Exception as e:
    print("health_body_unparsed")
PY
    rm -f /tmp/kha-ching-health.json
  fi
else
  echo "curl=not_on_path"
fi

section "Postgres (no credentials printed)"
if have pg_isready; then
  pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1 && echo "pg_isready_127.0.0.1:5432=ok" || echo "pg_isready_127.0.0.1:5432=fail"
else
  echo "pg_isready=not_on_path"
fi
if have docker; then
  docker exec kha-ching-postgres pg_isready -U postgres -d trading_db >/dev/null 2>&1 \
    && echo "docker_postgres=ok" || echo "docker_postgres=skip_or_fail"
fi

section "Redis (no credentials printed)"
if have redis-cli; then
  if redis-cli -h 127.0.0.1 -p 6379 ping >/dev/null 2>&1; then
    echo "redis_cli_127.0.0.1:6379=ok"
  else
    echo "redis_cli_127.0.0.1:6379=fail_or_auth_required"
  fi
else
  echo "redis-cli=not_on_path"
fi
if have docker; then
  docker exec kha-ching-redis redis-cli ping >/dev/null 2>&1 \
    && echo "docker_redis=ok" || echo "docker_redis=skip_or_fail"
fi

section "BullMQ (counts only; queue names include a secret suffix and are not printed)"
if have redis-cli; then
  count=$(redis-cli -h 127.0.0.1 -p 6379 --scan --pattern 'bull:*:meta' 2>/dev/null | wc -l | tr -d ' ')
  echo "bull_meta_keys=${count:-unknown}"
else
  echo "bull_meta_keys=skipped"
fi

section "TLS (optional PUBLIC_HOST)"
if [[ -n "${PUBLIC_HOST:-}" ]] && have openssl; then
  echo | openssl s_client -servername "$PUBLIC_HOST" -connect "${PUBLIC_HOST}:443" 2>/dev/null \
    | openssl x509 -noout -dates -subject -issuer 2>/dev/null \
    || echo "tls_probe_failed"
else
  echo "set PUBLIC_HOST=your.domain to probe certificate dates"
fi

echo
echo "=== end (read-only; no changes made) ==="
