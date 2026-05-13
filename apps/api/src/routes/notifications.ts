// Push Notification routes — Phase 10A foundation stubs
//
// Real Web Push (VAPID) is NOT enabled in Phase 10A.
// These endpoints provide the API contract and in-memory subscription registry
// so the frontend can be built and tested without live push delivery.
//
// Production readiness:
//   - Set VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY + VAPID_SUBJECT in env to enable real push.
//   - Replace in-memory subscriptions with a DB table in Phase 10B.
//   - No VAPID keys are committed to code. No external push calls made here.

import type { FastifyInstance } from 'fastify'
import { requireAuth, getAuthUser } from '../auth'

// In-memory subscription store (ephemeral — replaced with DB in Phase 10B)
// Key: `${tenantId}:${userId}` → subscription objects
const subscriptions = new Map<string, unknown[]>()

// VAPID public key from env (undefined if not configured — safe)
function getVapidPublicKey(): string | null {
  const key = process.env.VAPID_PUBLIC_KEY
  if (!key || key.trim() === '') return null
  return key.trim()
}

export async function notificationRoutes(app: FastifyInstance) {

  // ── GET /notifications/vapid-public-key ─────────────────────────────────
  // Returns VAPID public key for browser subscription setup.
  // Returns null if push is not configured — frontend should hide push UI.
  // NEVER returns VAPID_PRIVATE_KEY.
  app.get('/vapid-public-key', async () => {
    const key = getVapidPublicKey()
    return {
      publicKey: key,
      pushEnabled: key !== null,
      note: key
        ? 'VAPID configured — push subscription available'
        : 'Push notifications not configured (VAPID_PUBLIC_KEY not set) — stub mode',
    }
  })

  // ── POST /notifications/subscribe ───────────────────────────────────────
  // Registers a browser push subscription for the authenticated user.
  // In Phase 10A: stores in-memory (ephemeral). No real push sent.
  //
  // Body: Web Push PushSubscription JSON from browser:
  //   { endpoint, keys: { p256dh, auth } }
  app.post<{
    Body: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  }>('/subscribe', { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId, userId } = getAuthUser(req)
    const { endpoint, keys } = req.body ?? {}

    if (!endpoint || typeof endpoint !== 'string') {
      return reply.status(400).send({ error: 'endpoint is required' })
    }
    if (!keys?.p256dh || !keys?.auth) {
      return reply.status(400).send({ error: 'keys.p256dh and keys.auth are required' })
    }

    const key  = `${tenantId}:${userId}`
    const subs = subscriptions.get(key) ?? []

    // Idempotent: don't duplicate same endpoint
    if (!subs.some((s) => (s as { endpoint: string }).endpoint === endpoint)) {
      subs.push({ endpoint, keys })
      subscriptions.set(key, subs)
    }

    return reply.status(201).send({
      subscribed:  true,
      pushEnabled: getVapidPublicKey() !== null,
      note:        'Subscription registered. Real push delivery requires VAPID_PUBLIC_KEY configuration.',
    })
  })

  // ── DELETE /notifications/subscription ──────────────────────────────────
  // Removes a push subscription by endpoint URL.
  app.delete<{
    Body: { endpoint?: string }
  }>('/subscription', { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId, userId } = getAuthUser(req)
    const { endpoint }         = req.body ?? {}

    if (!endpoint) {
      return reply.status(400).send({ error: 'endpoint is required' })
    }

    const key  = `${tenantId}:${userId}`
    const subs = subscriptions.get(key) ?? []
    const filtered = subs.filter((s) => (s as { endpoint: string }).endpoint !== endpoint)
    subscriptions.set(key, filtered)

    return { unsubscribed: true }
  })

  // ── POST /notifications/test ─────────────────────────────────────────────
  // Sends a test push notification to the calling user's subscriptions.
  // In Phase 10A: stub only — no real push call made.
  app.post<{
    Body: { title?: string; body?: string }
  }>('/test', { preHandler: requireAuth }, async (req, _reply) => {
    const { tenantId, userId } = getAuthUser(req)
    const title = req.body?.title ?? 'Omni Test Notification'
    const body  = req.body?.body  ?? 'Push notification infrastructure is wired up.'

    const key   = `${tenantId}:${userId}`
    const subs  = subscriptions.get(key) ?? []
    const count = subs.length

    if (getVapidPublicKey() === null) {
      return {
        sent:        false,
        stub:        true,
        subscriptions: count,
        note:        'VAPID not configured — stub response only. Set VAPID_PUBLIC_KEY to enable real push.',
        payload:     { title, body },
      }
    }

    // When VAPID is configured: placeholder for real web-push call (Phase 10B)
    return {
      sent:          false,  // Phase 10B: will be true
      stub:          true,
      subscriptions: count,
      note:          'Real push delivery not yet implemented (Phase 10B). Subscription count returned.',
      payload:       { title, body },
    }
  })

  // ── GET /notifications/status ─────────────────────────────────────────────
  // Returns push notification config status for the calling user.
  app.get('/status', { preHandler: requireAuth }, async (req) => {
    const { tenantId, userId } = getAuthUser(req)
    const key   = `${tenantId}:${userId}`
    const count = (subscriptions.get(key) ?? []).length
    return {
      pushEnabled:        getVapidPublicKey() !== null,
      activeSubscriptions: count,
      phase:              '10A-stub',
    }
  })
}
