# Omni — Port Map

All Omni services use high ports (43100-43199) to avoid collisions with other projects on this machine.

## Reserved Ports

| Service | Port | Notes |
|---|---|---|
| Web Admin / PWA (`apps/web`) | 43110 | Next.js dev server |
| API Server (`apps/api`) | 43111 | Fastify REST + WebSocket |
| Worker (`apps/worker`) | 43112 | Internal health port only |
| PostgreSQL (dev Docker mapping) | 43113 | Maps to container port 5432 |
| Redis (dev Docker mapping) | 43114 | Maps to container port 6379 |

## Port Check (PowerShell)

```powershell
# Check all Omni ports at once
@(43110,43111,43112,43113,43114) | ForEach-Object {
    $r = netstat -ano | Select-String ":$_\s"
    if ($r) { "PORT $_ OCCUPIED: $r" } else { "PORT $_ free" }
}
```

## Conflict Resolution

If a port is occupied by a non-Omni process:
1. Identify the PID from `netstat -ano` output.
2. Identify the process: `(Get-CimInstance Win32_Process -Filter "ProcessId=<pid>").CommandLine`
3. If it is NOT an Omni process → choose the next free port in the 43115–43199 range.
4. Document the new port in this file.
5. Update `.env.example` and relevant config.

## Do NOT Use

- Port 80, 443, 3000, 3001, 4000, 8000, 8080, 8443 — common ports used by other projects.
- Any port currently used by TelehubX, WAhubX, FAhubX, ChatFlow Pro, M33_BOT.
