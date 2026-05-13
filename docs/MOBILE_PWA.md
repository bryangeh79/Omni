# Omni Mobile PWA — Phase 9A

## Overview

The `/pwa` route provides a mobile-first operator inbox for on-the-go customer service management. It is optimized for phone screens and can be installed as a Progressive Web App.

---

## Installation

Open `http://localhost:43110/pwa` (or the deployed domain) in a mobile browser, then use "Add to Home Screen." The PWA manifest is served at `/manifest.webmanifest`.

**PWA capabilities:**
- Standalone display mode (no browser chrome)
- Theme color: Omni blue (#2563eb)
- Start URL: `/pwa`
- Icons: `/icon-192.png`, `/icon-512.png` (placeholder SVGs; replace with branded assets)

---

## Route

| Route      | Description                                    |
|------------|------------------------------------------------|
| `/pwa`     | Mobile PWA shell — login then operator inbox   |
| `/inbox`   | Desktop Web Admin dashboard (Phase 8A)         |
| `/`        | Redirects to `/inbox`                          |

Both `/pwa` and `/inbox` share the same backend API. Authentication is per-session via localStorage JWT (Phase 9A; replace with httpOnly cookies in production).

---

## Mobile Views / Tabs

The PWA uses a bottom tab navigation with 5 tabs:

### ⚡ Boss Today

Summary view for the operator to see what needs action right now.

- **Stat cards:** Needs Human count, High Intent count, Active count
- **Needs Human section:** Conversations in `PENDING_HANDOFF` status — take over immediately
- **High Intent section:** Conversations where customer score ≥ 60 — conversion opportunity
- **Recent section:** Other active conversations sorted by last message time

### 💬 Inbox

All active (non-closed) conversations sorted by `lastMessageAt` desc.

- Conversation cards with: customer avatar, name, last message preview, timestamp, status dot, unread count badge, stage badge
- Tap a card → full-screen thread view

### 🙋 Need Human

Conversations in `PENDING_HANDOFF` status — customers who need a human agent response.

- Filtered view (same card design as Inbox)
- Red badge on tab shows count

### 🎯 High Intent

High-intent customers (score ≥ 60) in AI or pending handoff state.

- Shows lead score badge on cards
- Sorted by urgency

### 📅 Follow-up

Real follow-up task list (Phase 9B). Shows:
- Today's pending follow-up tasks
- Overdue tasks (red highlight)
- Human reminder tasks (amber badge)
- Task actions: Open Chat, Done (complete), Skip (cancel)

---

## Thread View (full-screen)

Tapping a conversation opens a full-screen thread:

```
┌─────────────────────────────────┐
│  ← Back | Customer name/status  │
├─────────────────────────────────┤
│  [Take Over] [Release AI] [Close]│
├─────────────────────────────────┤
│  [Load older messages]           │
│  Messages scrollable             │
│  (INBOUND / OUTBOUND / AI /      │
│   SYSTEM bubbles)                │
├─────────────────────────────────┤
│  Composer + Send                 │
└─────────────────────────────────┘
```

**Actions:**
- **Take Over** — appears when status is not HUMAN_HANDLING and not CLOSED
- **Release to AI** — appears when status is HUMAN_HANDLING
- **Close** — with confirmation; disables composer and action buttons

**Load older messages:** Appears when there are more pages; loads previous page and prepends to thread.

**Closed conversations:** Composer is replaced with "Conversation closed" notice. All action buttons are hidden.

---

## Customer Profile (bottom sheet)

Tap **Profile** in the thread header to open the customer card as a bottom sheet:

- Customer avatar, name, phone, company
- **Stage selector** — tap Edit to show stage grid; tap a stage to update immediately
- **Lead score** bar
- **Tags** — displayed as chips; comma-separated input + Save to replace all tags
- Notes (read-only in Phase 9A)
- Close button to dismiss

Stage and tag changes:
- Call `PATCH /customers/:id/stage` and `PATCH /customers/:id/tags`
- Publish `customer.updated` realtime event
- Thread refreshes after change

---

## Customer Stage / Tag Edit

### Stage Update

`PATCH /customers/:id/stage`

```json
{ "stage": "HIGH_INTENT" }
```

Valid stages: `NEW`, `INTERESTED`, `HIGH_INTENT`, `QUOTED`, `BOOKED`, `WON`, `LOST`, `AFTER_SALES`

- Tenant-scoped, auth required
- Publishes `customer.updated` realtime event
- Returns full customer object with tags array

### Tags Batch Replace

`PATCH /customers/:id/tags`

```json
{ "tags": ["vip", "high_intent"] }
```

Or comma-separated string:
```json
{ "tags": "vip, high_intent" }
```

- Replaces **all** existing tags atomically
- Empty array clears all tags
- Tenant-scoped, auth required
- Publishes `customer.updated` realtime event

The existing `POST /customers/:id/tags` (add single tag) and `DELETE /customers/:id/tags/:tag` (remove single tag) also publish `customer.updated`.

---

## Conversation Close

`POST /conversations/:id/close`

- Sets status to `CLOSED`
- Writes system audit message
- Publishes `conversation.updated` realtime event
- Tenant-scoped, auth required
- **No real WhatsApp message sent**

**After closing:**
- Takeover → 400
- Release-AI → 400
- Send message → 400

---

## Real-Time Updates in PWA

The PWA connects to `GET /realtime/events?token=<jwt>` on mount.

Events handled:
| Event Type | PWA action |
|-----------|-----------|
| `conversation.message.created` | Refresh list + open thread |
| `conversation.updated` | Refresh list + open thread |
| `conversation.handoff.updated` | Refresh list + open thread |
| `ai.reply.created` | Refresh list + open thread |
| `customer.updated` | Refresh list + open thread |

SSE transport indicator:
- 🟢 Green = Redis pub/sub (cross-process, includes worker events)
- 🟡 Yellow = In-memory fallback (single-process only)
- ⚫ Grey = Disconnected

---

## Limitations (Phase 9A)

| Feature | Status |
|---------|--------|
| Follow-up tab data | Placeholder (Phase 9B) |
| Real WhatsApp delivery | Stub — no real send |
| Message pagination scroll | Manual "Load older" button (no infinite scroll) |
| Customer notes edit | Read-only |
| Full profile edit | Stage + tags only |
| Push notifications | Not implemented |
| Offline mode | Not implemented |
| iOS full PWA (no browser bar) | Requires HTTPS + display:standalone |
| Placeholder icons | SVG placeholder — replace with brand assets |

---

## Future (Phase 9B+)

- Follow-up tab with real scheduled data
- Push notification support (Web Push API)
- Customer notes edit in profile sheet
- Quick-reply templates
- Multi-agent assignment view
- Boss leaderboard / performance stats
