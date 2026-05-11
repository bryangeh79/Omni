# Omni — Development Safety Rules

This is a shared development machine. Multiple projects coexist.

---

## Working Directory

**All Omni work must happen inside:**
```
C:\AI_WORKSPACE\Omni Ai Chatbot
```

## Do NOT Touch (other projects on this machine)

| Project | Path |
|---|---|
| TelehubX | C:\AI_WORKSPACE\TelehubX* |
| WAhubX | C:\AI_WORKSPACE\Whatsapp Auto Bot |
| FAhubX 1.0 | C:\FAhubX |
| FAhubX 2.0 | C:\AI_WORKSPACE\FAhubX-2.0 |
| ChatFlow Pro | (ChatFlow Pro path) |
| M33_BOT | (M33 path) |
| Facebook Auto Bot | C:\AI_WORKSPACE\Facebook Auto Bot |

---

## Forbidden Commands

These commands kill ALL node processes on the machine — they will destroy other running projects:

```
taskkill /F /IM node.exe      ← FORBIDDEN
killall node                  ← FORBIDDEN
pkill node                    ← FORBIDDEN
Stop-Process -Name node       ← FORBIDDEN
```

---

## Safe Process Stop Procedure

Before stopping any process:
1. Get exact PID: `Get-Process | Where-Object { $_.Id -eq <pid> }`
2. Get command line: `(Get-CimInstance Win32_Process -Filter "ProcessId=$pid").CommandLine`
3. Confirm the command line contains `C:\AI_WORKSPACE\Omni Ai Chatbot`
4. Confirm the port belongs to Omni (see PORTS.md)
5. Only then: `Stop-Process -Id <pid>`

---

## Secret Handling

- All secrets in `.env` only.
- `.env` is in `.gitignore` — never commit it.
- Use `.env.example` with redacted placeholder values.
- Never log, print, or expose token/secret values in code, reports, or comments.

---

## Git Safety

- Do not commit without explicit instruction.
- Do not push without explicit instruction.
- Do not `git push --force` without explicit instruction.
- Do not commit `.env`, `node_modules`, or secrets.

---

## Port Safety

See `PORTS.md` for the full Omni port map. Always run port check before starting a service:

```powershell
netstat -ano | Select-String ":<port>"
```
