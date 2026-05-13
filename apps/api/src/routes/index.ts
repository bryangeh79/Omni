// API Route Registry — skeleton
// All routes are stubs. Implementation starts Phase 1+.

import type { FastifyInstance } from 'fastify'

import { authRoutes }         from './auth'
import { tenantRoutes }       from './tenant'
import { channelRoutes }      from './channel'
import { customerRoutes }     from './customer'
import { conversationRoutes } from './conversation'
import { messageRoutes }      from './message'
import { knowledgeRoutes }    from './knowledge'
import { aiConfigRoutes }     from './ai-config'
import { aiAgentRoutes }      from './ai-agent'
import { automationRoutes }   from './automation'
import { dashboardRoutes }    from './dashboard'
import { usageRoutes }        from './usage'
import { webhookMetaRoutes }  from './webhook-meta'
import { realtimeRoutes }     from './realtime'
import { followUpRoutes }     from './follow-up'
import { notificationRoutes } from './notifications'
import { opsRoutes }          from './ops'
import { bossRoutes }           from './boss'
import { costCalculatorRoutes } from './cost-calculator'
import { onboardingRoutes }     from './onboarding'
import { settingsRoutes }       from './settings'
import { billingRoutes }        from './billing'
import { productionQaRoutes }   from './production-qa'
import { teamRoutes }            from './team'
import { auditRoutes }             from './audit'
import { releaseChecklistRoutes }   from './release-checklist'
import { activationRoutes }         from './activation'

export async function registerRoutes(app: FastifyInstance) {
  await app.register(authRoutes,         { prefix: '/auth' })
  await app.register(tenantRoutes,       { prefix: '/tenants' })
  await app.register(channelRoutes,      { prefix: '/channels' })
  await app.register(customerRoutes,     { prefix: '/customers' })
  await app.register(conversationRoutes, { prefix: '/conversations' })
  await app.register(messageRoutes,      { prefix: '/messages' })
  await app.register(knowledgeRoutes,    { prefix: '/knowledge' })
  // /knowledge/items — same CRUD routes, registered at /items sub-path (Phase 12B alias)
  await app.register(knowledgeRoutes,    { prefix: '/knowledge/items' })
  await app.register(aiConfigRoutes,     { prefix: '/ai-config' })
  await app.register(aiAgentRoutes,      { prefix: '/ai-agent' })
  await app.register(automationRoutes,   { prefix: '/automation' })
  await app.register(dashboardRoutes,    { prefix: '/dashboard' })
  await app.register(usageRoutes,        { prefix: '/usage' })
  // Inbound webhooks — no auth; public routes for channel providers (Phase 7A+)
  await app.register(webhookMetaRoutes,  { prefix: '/webhooks' })
  // Real-time SSE — auth via ?token= query param
  await app.register(realtimeRoutes,     { prefix: '/realtime' })
  // Follow-up tasks — Phase 9B
  await app.register(followUpRoutes,     { prefix: '/follow-ups' })
  // Push notification stubs — Phase 10A
  await app.register(notificationRoutes, { prefix: '/notifications' })
  // Ops/health/readiness — Phase 10B
  await app.register(opsRoutes,          { prefix: '/ops' })
  // Boss Dashboard Command Center — Phase 11A
  await app.register(bossRoutes,         { prefix: '/boss' })
  // Internal cost/pricing calculator — Phase 11A
  await app.register(costCalculatorRoutes, { prefix: '/admin/cost-calculator' })
  // Onboarding wizard — Phase 11B
  await app.register(onboardingRoutes,     { prefix: '/onboarding' })
  // Tenant admin settings — Phase 15A
  await app.register(settingsRoutes,       { prefix: '/settings' })
  // Billing / plan readiness — Phase 15A
  await app.register(billingRoutes,        { prefix: '/billing' })
  // Production QA checklist — Phase 15A
  await app.register(productionQaRoutes,   { prefix: '/production-qa' })
  // Team management + RBAC — Phase 15B
  await app.register(teamRoutes,            { prefix: '/team' })
  // Audit log — Phase 15C
  await app.register(auditRoutes,           { prefix: '/audit' })
  // Release checklist — Phase 15D
  await app.register(releaseChecklistRoutes, { prefix: '/release-checklist' })
  // Production activation guide API — Phase 16A
  await app.register(activationRoutes,       { prefix: '/activation' })
}
