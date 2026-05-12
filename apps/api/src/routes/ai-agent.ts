// AI Agent routes — provider settings, dry-run testing (Phase 5A)
// Real LLM calls: Phase 5B (requires configured API keys)

import type { FastifyInstance } from 'fastify'
import { prisma } from '@omni/db'
import { AI_PROVIDERS, isValidProviderModel, getModelsForProvider } from '@omni/shared'
import { requireAuth, getAuthUser } from '../auth'
import { aiOrchestrator } from '@omni/ai-core'
import { buildJobContext } from '../ai-context'

export async function aiAgentRoutes(app: FastifyInstance) {

  // ── GET /ai-agent/providers ────────────────────────────────────────────────
  // Returns provider/model allowlist. Public within the tenant (no key exposed).
  app.get('/providers', { preHandler: requireAuth }, async (_req) => {
    return {
      providers: Object.entries(AI_PROVIDERS).map(([key, val]) => ({
        provider: key,
        label:    val.label,
        models:   val.models,
      })),
    }
  })

  // ── GET /ai-agent/settings ────────────────────────────────────────────────
  app.get('/settings', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)

    const config = await prisma.aiConfig.findUnique({ where: { tenantId } })
    if (!config) {
      return {
        tenantId,
        aiProvider:          'DRY_RUN',
        model:               'dry-run',
        useTenantApiKey:     false,
        hasApiKey:           false,      // never expose raw key
        persona:             null,
        goals:               [],
        systemPrompt:        null,
        replyLanguagePolicy: 'AUTO',
        temperature:         null,
        maxTokens:           null,
        isActive:            true,
      }
    }

    // Never return apiKeyRef — callers only see hasApiKey boolean
    return {
      tenantId:            config.tenantId,
      aiProvider:          config.aiProvider,
      model:               config.model,
      useTenantApiKey:     config.useTenantApiKey,
      hasApiKey:           !!config.apiKeyRef,     // boolean only, never the key
      persona:             config.persona,
      goals:               config.goals,
      systemPrompt:        config.systemPrompt,
      replyLanguagePolicy: config.replyLanguagePolicy,
      temperature:         config.temperature,
      maxTokens:           config.maxTokens,
      isActive:            config.isActive,
    }
  })

  // ── PATCH /ai-agent/settings ──────────────────────────────────────────────
  app.patch<{
    Body: {
      aiProvider?:          string
      model?:               string
      useTenantApiKey?:     boolean
      persona?:             string | null
      goals?:               string[]
      systemPrompt?:        string | null
      replyLanguagePolicy?: string
      temperature?:         number | null
      maxTokens?:           number | null
      isActive?:            boolean
    }
  }>('/settings', { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId } = getAuthUser(req)
    const body         = req.body ?? {}

    // Validate provider + model combination
    if (body.aiProvider !== undefined || body.model !== undefined) {
      const currentConfig = await prisma.aiConfig.findUnique({ where: { tenantId } })
      const provider = body.aiProvider ?? currentConfig?.aiProvider ?? 'DRY_RUN'
      const model    = body.model      ?? currentConfig?.model      ?? 'dry-run'

      if (!Object.keys(AI_PROVIDERS).includes(provider)) {
        return reply.status(400).send({
          error: `Invalid aiProvider. Valid: ${Object.keys(AI_PROVIDERS).join(', ')}`,
        })
      }
      if (!isValidProviderModel(provider, model)) {
        return reply.status(400).send({
          error:        `Invalid model for provider ${provider}.`,
          validModels:  getModelsForProvider(provider),
        })
      }
    }

    // Validate temperature
    if (body.temperature !== undefined && body.temperature !== null) {
      if (body.temperature < 0 || body.temperature > 2) {
        return reply.status(400).send({ error: 'temperature must be between 0 and 2' })
      }
    }
    // Validate maxTokens
    if (body.maxTokens !== undefined && body.maxTokens !== null) {
      if (body.maxTokens < 100 || body.maxTokens > 8192) {
        return reply.status(400).send({ error: 'maxTokens must be between 100 and 8192' })
      }
    }

    // Upsert config
    const updated = await prisma.aiConfig.upsert({
      where:  { tenantId },
      create: {
        tenantId,
        aiProvider:          body.aiProvider          ?? 'DRY_RUN',
        model:               body.model               ?? 'dry-run',
        useTenantApiKey:     body.useTenantApiKey      ?? false,
        persona:             body.persona,
        goals:               body.goals               ?? [],
        systemPrompt:        body.systemPrompt,
        replyLanguagePolicy: body.replyLanguagePolicy ?? 'AUTO',
        temperature:         body.temperature,
        maxTokens:           body.maxTokens,
        isActive:            body.isActive             ?? true,
      },
      update: {
        ...(body.aiProvider          !== undefined ? { aiProvider: body.aiProvider }                     : {}),
        ...(body.model               !== undefined ? { model: body.model }                               : {}),
        ...(body.useTenantApiKey     !== undefined ? { useTenantApiKey: body.useTenantApiKey }           : {}),
        ...(body.persona             !== undefined ? { persona: body.persona }                           : {}),
        ...(body.goals               !== undefined ? { goals: body.goals }                               : {}),
        ...(body.systemPrompt        !== undefined ? { systemPrompt: body.systemPrompt }                 : {}),
        ...(body.replyLanguagePolicy !== undefined ? { replyLanguagePolicy: body.replyLanguagePolicy }   : {}),
        ...(body.temperature         !== undefined ? { temperature: body.temperature }                   : {}),
        ...(body.maxTokens           !== undefined ? { maxTokens: body.maxTokens }                       : {}),
        ...(body.isActive            !== undefined ? { isActive: body.isActive }                         : {}),
      },
    })

    // Never return apiKeyRef
    return {
      tenantId:            updated.tenantId,
      aiProvider:          updated.aiProvider,
      model:               updated.model,
      useTenantApiKey:     updated.useTenantApiKey,
      hasApiKey:           !!updated.apiKeyRef,
      persona:             updated.persona,
      goals:               updated.goals,
      systemPrompt:        updated.systemPrompt,
      replyLanguagePolicy: updated.replyLanguagePolicy,
      temperature:         updated.temperature,
      maxTokens:           updated.maxTokens,
      isActive:            updated.isActive,
    }
  })

  // ── POST /ai-agent/dry-run ────────────────────────────────────────────────
  // Preview AI response for a message. Does NOT write to DB, does NOT send WhatsApp.
  app.post<{
    Body: { message?: string; customerId?: string; conversationId?: string }
  }>('/dry-run', { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId } = getAuthUser(req)
    const { message, customerId, conversationId } = req.body ?? {}

    if (!message || typeof message !== 'string' || !message.trim()) {
      return reply.status(400).send({ error: 'message is required and must be non-empty' })
    }

    const agentInput = await buildJobContext({
      tenantId,
      conversationId: conversationId ?? 'dry-run-preview',
      customerId:     customerId     ?? 'dry-run-preview',
      messageId:      'dry-run-preview',
      messageBody:    message.trim(),
    })

    const result = await aiOrchestrator.process(agentInput)

    return {
      ...result,
      note: 'Dry-run only — no message written to DB, no WhatsApp sent',
    }
  })
}
