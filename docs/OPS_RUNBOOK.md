# Production Ops Runbook — Phase 15C

## Omni Service Ports

| Service | Port | Check |
|---|---|---|
| Web (Next.js) | 43110 | TCP connect |
| API (Fastify) | 43111 | GET /ops/health → 200 |
| Worker | 43112 | Process running |
| PostgreSQL | 43113 | TCP connect + query |
| Redis | 43114 | TCP connect + PING |

**Do not use these ports for any other project on the same machine.**

---

## Health Checks

```
GET http://localhost:43111/ops/health   → { status: "ok", db: true, redis: true, ... }
GET http://localhost:43111/ops/ready    → { ready: true }
```

Set up an external uptime monitor (UptimeRobot, BetterUptime, etc.) to probe `/ops/health` every 60 seconds.

---

## Backup & Restore

### Backup (daily minimum)
```bash
PGPASSWORD=<password> pg_dump \
  -h localhost -p 43113 -U omni_user omni_dev \
  > backup_$(date +%Y%m%d_%H%M%S).sql
```

Store backup copies off-server (S3, GCS, or SFTP). Retain minimum 7 days.

### Restore
```bash
# Test in an isolated dev database first
PGPASSWORD=<password> psql \
  -h localhost -p 43113 -U omni_user omni_dev \
  < backup_YYYYMMDD_HHMMSS.sql
```

**Test the restore procedure in staging before production launch.**

---

## Monitoring Checklist

- [ ] External uptime monitor on `/ops/health` (alert on 2 consecutive failures)
- [ ] Error rate alert: >1% 5xx responses over 5 minutes triggers alert
- [ ] Disk usage alert at 80% capacity
- [ ] Database size growth tracked
- [ ] API and worker logs retained ≥30 days
- [ ] Redis memory monitored; eviction policy configured (`allkeys-lru` recommended)

---

## Incident Response Procedure

1. Confirm scope: which tenants, channels, features are affected?
2. Check API health: `GET /ops/health` and `/ops/ready`
3. Check PostgreSQL: can you connect to port 43113 and run a test query?
4. Check Redis: can you connect to port 43114 and `PING`?
5. Check Worker: is the worker process running and processing jobs from the queue?
6. Review API logs for 5xx errors or uncaught exceptions
7. If WhatsApp session issue: verify `OMNI_ALLOW_WA_SESSION` flag status
8. If Meta webhook issue: verify webhook verify token and channel configuration
9. Notify affected tenants via out-of-band channel (email or WhatsApp)
10. Capture incident timeline, root cause, and corrective actions for post-mortem

---

## Support Readiness

- [ ] Support contact method defined and communicated to tenants
- [ ] Escalation path documented: L1 (tenant self-service) → L2 (operator support) → Engineer
- [ ] Tenant communication template ready for outages
- [ ] This runbook URL shared with the ops team

---

## Audit Log

Admin activity is recorded in the `AuditLog` table and visible at `/audit`. See `docs/AUDIT_LOGS.md` for details.

---

## Related Pages

- `/production-qa` — full launch readiness checklist
- `/audit` — admin activity timeline
- `/ops/runbook` — this runbook (web UI version)
- `/activation-guide` — step-by-step production activation guide (Phase 16A)
- `/activation/preflight` — API: pre-flight readiness checks
- `/activation/dry-run` — API: simulate activation without enabling real send
- `/activation/health` — API: post-activation safety flags + channel health
