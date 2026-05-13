# Omni Lead Pipeline Analytics — Phase 11B

## Overview

The pipeline shows where your leads are in the sales funnel and highlights areas needing attention.

## API

### GET /boss/pipeline?range=today|7d|30d

Requires auth. Default range: 30d.

```json
{
  "tenantId": "...",
  "range": "30d",
  "funnel": [
    { "stage": "NEW",         "count": 15, "overdueFollowUps": 0, "pendingFollowUps": 2 },
    { "stage": "INTERESTED",  "count": 8,  "overdueFollowUps": 1, "pendingFollowUps": 3 },
    { "stage": "HIGH_INTENT", "count": 4,  "overdueFollowUps": 0, "pendingFollowUps": 2 },
    { "stage": "QUOTED",      "count": 3,  "overdueFollowUps": 0, "pendingFollowUps": 1 },
    { "stage": "BOOKED",      "count": 2,  "overdueFollowUps": 0, "pendingFollowUps": 0 },
    { "stage": "WON",         "count": 5,  "overdueFollowUps": 0, "pendingFollowUps": 0 },
    { "stage": "LOST",        "count": 2,  "overdueFollowUps": 0, "pendingFollowUps": 0 }
  ],
  "summary": {
    "totalLeads": 39,
    "newSince": 23,
    "wonSince": 5,
    "lostSince": 2,
    "highIntentNoOwner": 1,
    "pipelineHealthPct": 44,
    "note": "Pipeline needs attention"
  }
}
```

### GET /boss/agents

Per-agent workload and performance. Requires auth.

```json
{
  "agents": [
    { "userId": "...", "name": "Alice", "role": "AGENT",
      "openConversations": 3, "closedLast30d": 12, "handledLast30d": 8 }
  ],
  "unassigned": 2
}
```

## Pipeline Health Score

```
healthPct = (INTERESTED + HIGH_INTENT + QUOTED + BOOKED) / total × 100
```

- ≥ 50%: Healthy
- 20-49%: Needs attention
- < 20%: Stalled — review follow-up strategy

## Limitations (Phase 11B)

- Price-asked-to-quoted conversion requires message content tagging (Phase 12)
- Avg response time not tracked (Phase 12 — requires message timestamp analytics)
- No historical funnel comparison (week-over-week)
- `overdueFollowUps` counts tasks from follow-up automation; manual tasks not tracked
