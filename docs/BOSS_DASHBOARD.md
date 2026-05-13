# Omni Boss Dashboard — Phase 11A

## Purpose

The Boss Dashboard (`/boss`) is the **command center** for business owners and administrators. It answers:

- Who needs my attention RIGHT NOW?
- Where are leads leaking or stalling?
- What follow-ups are overdue?
- How is the AI performing today?
- What should I do next?

It is action-oriented, not a vanity metrics page.

---

## Routes

| Route | Description |
|-------|-------------|
| `/boss` | Web Boss Dashboard (desktop + tablet) |
| `/pwa` → Boss Today tab | Mobile version using same API data |

---

## API Endpoints

### GET /boss/today

Today's actionable snapshot. Requires auth (any role).

```json
{
  "tenantId": "...",
  "asOf": "2026-05-13T...",
  "today": {
    "newCustomers": 3,
    "needHuman": 2,
    "highIntentCustomers": 5,
    "overdueFollowUps": 1,
    "dueFollowUpsToday": 3,
    "humanRemindersPending": 1,
    "openConversations": 12,
    "closedToday": 4,
    "aiReplies": 47,
    "aiCostUsd": 0.004
  },
  "urgentCustomers": [...],
  "suggestedActions": [
    {
      "priority": "urgent",
      "type": "NEED_HUMAN",
      "label": "2 conversations waiting for human",
      "hint": "Customers are pending handoff — take over before they disengage.",
      "link": "/inbox"
    }
  ]
}
```

**suggestedActions priorities:**
- `urgent` — needs immediate action (PENDING_HANDOFF, human reminders)
- `high` — important but not immediate (overdue follow-ups, high-intent unreviewed)
- `normal` — informational (new customers, due today)
- `ALL_CLEAR` — no urgent actions

### GET /boss/metrics

30-day aggregate metrics. Requires auth.

```json
{
  "customers": { "total": 150, "new30d": 23, "highIntent": 12, "stageBreakdown": {...} },
  "conversations": { "open": 8, "pendingHandoff": 2, "closedToday": 4, "closed30d": 45 },
  "followUps": { "pending": 5, "overdue": 1, "completed30d": 18 },
  "usage30d": { "aiReplies": 850, "llmTokens": 510000, "estimatedCostUsd": 0.08 }
}
```

---

## Dashboard Sections

| Section | Data source | Refreshes |
|---------|-------------|-----------|
| Urgent actions | `/boss/today` | Every 2 min |
| Today stats | `/boss/today` | Every 2 min |
| Follow-up workload | `/boss/today` + `/boss/metrics` | Every 2 min |
| Urgent customer table | `/boss/today.urgentCustomers` | Every 2 min |
| 30-day overview | `/boss/metrics` | Every 2 min |
| Stage breakdown | `/boss/metrics` | Every 2 min |

---

## Safety

- All data is DB-derived and tenant-scoped via JWT
- No real AI provider calls
- No real WhatsApp sends
- No secrets in responses

---

## Limitations (Phase 11A)

- Auto-refresh is interval-based (2 min), not SSE-push
- No date range filters (only today/30d)
- Closed/Won/Lost conversion rate not yet calculated
- Price-asked-to-won pipeline gap not tracked as a metric
- No user-specific (per-agent) breakdown yet
