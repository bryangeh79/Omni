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

export async function registerRoutes(app: FastifyInstance) {
  await app.register(authRoutes,         { prefix: '/auth' })
  await app.register(tenantRoutes,       { prefix: '/tenants' })
  await app.register(channelRoutes,      { prefix: '/channels' })
  await app.register(customerRoutes,     { prefix: '/customers' })
  await app.register(conversationRoutes, { prefix: '/conversations' })
  await app.register(messageRoutes,      { prefix: '/messages' })
  await app.register(knowledgeRoutes,    { prefix: '/knowledge' })
  await app.register(aiConfigRoutes,     { prefix: '/ai-config' })
  await app.register(aiAgentRoutes,      { prefix: '/ai-agent' })
  await app.register(automationRoutes,   { prefix: '/automation' })
  await app.register(dashboardRoutes,    { prefix: '/dashboard' })
  await app.register(usageRoutes,        { prefix: '/usage' })
  // Inbound webhooks — no auth; public routes for channel providers (Phase 7A+)
  await app.register(webhookMetaRoutes,  { prefix: '/webhooks' })
}
