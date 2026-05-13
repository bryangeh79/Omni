# Omni Push Notifications — Phase 10A Foundation

## Overview

Phase 10A adds Web Push API stub endpoints. Real push delivery is NOT enabled — subscriptions are stored in-memory and no VAPID calls are made. This establishes the API contract for Phase 10B production push.

---

## Current Status (Phase 10A)

| Feature | Status |
|---------|--------|
| Subscription API | Stub — in-memory, ephemeral |
| VAPID public key endpoint | Ready (reads from env) |
| Real push delivery | Not enabled |
| Subscription persistence | Not implemented (DB in Phase 10B) |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VAPID_PUBLIC_KEY` | No | Base64url VAPID public key. If unset, push is disabled (`pushEnabled: false`). |
| `VAPID_PRIVATE_KEY` | Phase 10B | VAPID private key — never committed to code |
| `VAPID_SUBJECT` | Phase 10B | Contact email or URL for VAPID |

**Security:** `VAPID_PRIVATE_KEY` is NEVER exposed via any API endpoint. Only the public key is shared.

---

## API Endpoints

All endpoints are under `/notifications/`:

### GET /notifications/vapid-public-key

Returns VAPID public key for browser subscription setup. No auth required.

```json
{
  "publicKey": "BH...",  // or null if not configured
  "pushEnabled": true,
  "note": "VAPID configured — push subscription available"
}
```

**Frontend usage:**
```javascript
const { publicKey, pushEnabled } = await fetchVapidPublicKey()
if (!pushEnabled) return  // hide push UI

const sub = await registration.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: publicKey,
})
await subscribePushNotifications(sub.toJSON())
```

### POST /notifications/subscribe

Register a Web Push subscription. Requires auth.

```json
{
  "endpoint": "https://fcm.googleapis.com/...",
  "keys": { "p256dh": "...", "auth": "..." }
}
```

Response:
```json
{ "subscribed": true, "pushEnabled": false, "note": "..." }
```

### DELETE /notifications/subscription

Unregister a subscription by endpoint. Requires auth.

```json
{ "endpoint": "https://fcm.googleapis.com/..." }
```

### POST /notifications/test

Send a test notification. Returns stub response in Phase 10A. Requires auth.

```json
{ "title": "Test", "body": "Hello!" }
```

Response:
```json
{ "sent": false, "stub": true, "subscriptions": 1, "note": "..." }
```

### GET /notifications/status

Returns push config status for current user. Requires auth.

```json
{ "pushEnabled": false, "activeSubscriptions": 0, "phase": "10A-stub" }
```

---

## Frontend Integration (Phase 10A)

```typescript
import { fetchVapidPublicKey, subscribePushNotifications, fetchNotificationStatus } from '@/lib/api'

// Check if push is available
const { pushEnabled, publicKey } = await fetchVapidPublicKey()

// Request browser permission
const permission = await Notification.requestPermission()
if (permission !== 'granted') return

// Subscribe
const reg = await navigator.serviceWorker.ready
const sub = await reg.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: publicKey!,
})
await subscribePushNotifications(sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } })
```

---

## Phase 10B Production Plan

1. Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` in production env
2. Install `web-push` npm package in `apps/api`
3. Add `PushSubscription` DB model for persistence
4. Replace in-memory subscription store with DB queries
5. Implement real push in `POST /notifications/test` and background jobs
6. Add service worker (`/public/sw.js`) for `push` event handling
7. Send push on follow-up due, new message, handoff escalation

---

## Service Worker (Phase 10B)

The service worker is NOT implemented in Phase 10A. A placeholder is needed at `/public/sw.js` for registration. The manifest `start_url: /pwa` will be the install entry point.

---

## Limitations (Phase 10A)

- Subscriptions are lost on API restart (in-memory)
- No real push messages sent
- Service worker not implemented
- Push permission UI not in `/pwa` or `/inbox` yet
- VAPID keys not configured in development by default
