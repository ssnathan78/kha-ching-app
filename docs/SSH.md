# SSH to the production Droplet

How any person or coding agent (Cursor, Claude Code, Copilot, Windsurf, Aider, Continue, a plain terminal) reaches production. **The contract is OpenSSH on your laptop**, not a vendor plugin.

Do not commit a filled-in `HostName` / `User`. Template: [ssh-config.example](./ssh-config.example). Operations after you are in: [PRODUCTION_RUNBOOK.md](./PRODUCTION_RUNBOOK.md).

## What is already true on this desk (2026-09)

| Item | Where it lives |
|---|---|
| Host alias | Laptop `~/.ssh/config` → `Host kha-ching-prod` (Windows: `C:\Users\<you>\.ssh\config`, **no `.txt`**) |
| Linux user | `senthil` (sudo needs a password; Docker does not) |
| Key | `~/.ssh/id_ed25519` — **passphrase-protected** |
| Droplet layout | Docker at `/srv/khaching/app`; nginx :80/:443; app **3000 on 127.0.0.1 only** |
| App containers | `kha-ching-app`, `kha-ching-db`, `kha-ching-redis` |

The Droplet IP and username stay in **laptop** `~/.ssh/config` only.

## One-time laptop setup

1. OpenSSH client installed (Windows 10/11: Settings → Optional features → OpenSSH Client).
2. File **must** be named `config`, not `config.txt` (Notepad “Save as” often adds `.txt`).
3. Copy [ssh-config.example](./ssh-config.example) into that file and fill `HostName` / `User`.
4. Public key (`id_ed25519.pub`) is in `/home/senthil/.ssh/authorized_keys` on the Droplet.
5. Windows ACL on the private key (once):

```powershell
icacls $env:USERPROFILE\.ssh\id_ed25519 /inheritance:r
icacls $env:USERPROFILE\.ssh\id_ed25519 /grant:r "$($env:USERNAME):(R)"
```

6. Enable the **Windows** OpenSSH agent (Administrator PowerShell, once):

```powershell
Get-Service ssh-agent | Set-Service -StartupType Manual
Start-Service ssh-agent
```

`StartupType Manual` means the agent does **not** start by itself after a Windows reboot.

7. Load the key (normal PowerShell, enter the key passphrase):

```powershell
ssh-add $env:USERPROFILE\.ssh\id_ed25519
ssh -o BatchMode=yes kha-ching-prod -- uname -a
```

`BatchMode=yes` must succeed without a prompt. That is what agents use.

## Reminder: “after a reboot”

This means a **Windows PC restart or shutdown**, not:

- restarting PowerShell or Cursor
- rebooting the DigitalOcean Droplet

| Event | What you do | Where |
|---|---|---|
| Windows restart / full shutdown | If `ssh-add` says there is no agent: **Admin** PowerShell → `Start-Service ssh-agent`. Then **normal** PowerShell → `ssh-add` + passphrase. | Laptop |
| Close Cursor / close a terminal | Usually nothing. The key stays in the Windows `ssh-agent` service. | — |
| Droplet reboot | Nothing on Windows. The server never stores your passphrase. | — |
| `ssh` asks for the key passphrase again | Agent not running or key not added. Repeat `Start-Service` + `ssh-add`. | Laptop |

Check:

```powershell
ssh -o BatchMode=yes kha-ching-prod -- uname -a
```

## How any coding agent connects

No special Cursor (or other) SSH setting is required. The tool must run commands in a **terminal as your Windows user**, so it sees `~/.ssh/config` and the same `ssh-agent`.

Tell the new tool, in its rules or first message:

```
Production SSH host alias is kha-ching-prod (defined only in the operator laptop ~/.ssh/config).
Always: ssh -o BatchMode=yes kha-ching-prod -- <command>
Read-only first. Do not invent HostName, User, or keys.
Do not print .env, private keys, or BullMQ queue names (they include KITE_API_KEY).
Do not place/cancel/modify Kite orders or change MOCK_ORDERS without explicit approval.
Health: pipe scripts/production-health-check.sh (strip CR on Windows).
Facts: docs/SSH.md, docs/PRODUCTION_RUNBOOK.md, docs/PRODUCTION_HEALTH.md.
```

Examples that work in Cursor, Claude Code, Copilot Chat agent, Windsurf, Aider, or a human:

```powershell
ssh -o BatchMode=yes kha-ching-prod -- uname -a
ssh -o BatchMode=yes kha-ching-prod -- "docker ps"
ssh -o BatchMode=yes kha-ching-prod -- "curl -sS -m 8 http://127.0.0.1:3000/api/health"
```

Windows health script (CRLF-safe):

```powershell
$h = [IO.File]::ReadAllText("scripts\production-health-check.sh").Replace("`r`n", "`n")
$h | ssh -o BatchMode=yes kha-ching-prod "bash -s"
```

If the tool cannot use your local SSH agent (cloud-only agent, remote VM without your key): **do not** upload the private key. Use the DigitalOcean web console yourself, or run SSH on the laptop and paste only **non-secret** command output into the tool.

`ForwardAgent no` — do not hop credentials through the Droplet.

## Agent rules (every tool)

- Prefer **SAFE / READ-ONLY** commands ([PRODUCTION_RUNBOOK.md](./PRODUCTION_RUNBOOK.md)).
- `senthil` can run `docker` without sudo. `sudo` needs the operator’s password — the agent cannot enter it.
- Trading: never submit, cancel, or change a live order without explicit confirmation.
- Secrets: report `NAME = configured` / `missing`. Safe to print values: `NODE_ENV`, `MOCK_ORDERS`, `SESSION_COOKIE_SECURE`, `TZ`, `PORT`, `BIND_HOST`.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `Could not resolve hostname kha-ching-prod` | No `~/.ssh/config`, or Notepad saved `config.txt` |
| `Permission denied (publickey)` + verbose `Server accepts key` then no packet | Passphrase key and no agent / `BatchMode` cannot prompt. `ssh-add` on Windows. |
| `Permission denied (publickey)` and server never accepts | Wrong user, or `authorized_keys` missing this `.pub` |
| `ssh-agent` Access denied / cannot start | Need **Administrator** PowerShell for `Set-Service` / `Start-Service` |
| Health script `pipefail\r: invalid option` | Windows CRLF. Strip `\r` before piping (see above). |

Verbose (safe; does not print the private key):

```powershell
ssh -vvv -o BatchMode=yes kha-ching-prod -- uname -a
```
