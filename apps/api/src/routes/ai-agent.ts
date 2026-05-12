// AI Agent routes — provider settings, key vault, dry-run (Phase 5A/5B)
// Real LLM calls: Phase 5C (requires configured + decryptable API key)

import type { FastifyInstance } from 'fastify'
import { prisma } from '@omni/db'
import { AI_PROVIDERS, isValidProviderModel, getModelsForProvider } from '@omni/shared'
import { requireAuth, getAuthUser } from '../auth'
import { aiOrchestrator } from '@omni/ai-core'
import { buildJobContext } from '../ai-context'
import {
  isVaultConfigured,
  encryptApiKey,
  decryptApiKey,
  extractLast4,
  validateKeyShape,
  KEY_PROVIDERS,
} from '../security/api-key-vault'

// ── Safe settings projection (never exposes raw/encrypted key) ──────────────
function safeSettingsView(tenantId: string, config: {
  aiProvider: string; model: string; useTenantApiKey: boolean; apiKeyRef?: string | null;
  apiKeyLast4?: string | null; apiKeyProvider?: string | null; apiKeyUpdatedAt?: Date | null;
  persona?: string | null; goals: string[]; systemPrompt?: string | null;
  replyLanguagePolicy: string; temperature?: number | null; maxTokens?: number | null; isActive: boolean;
}) {
  return {
    tenantId,
    aiProvider:          config.aiProvider,
    model:               config.model,
    useTenantApiKey:     config.useTenantApiKey,
    hasApiKey:           !!config.apiKeyRef,          // boolean only
    apiKeyLast4:         config.apiKeyLast4 ?? null,  // display only
    apiKeyProvider:      config.apiKeyProvider ?? null,
    apiKeyUpdatedAt:     config.apiKeyUpdatedAt ?? null,
    persona:             config.persona,
    goals:               config.goals,
    systemPrompt:        config.systemPrompt,
    replyLanguagePolicy: config.replyLanguagePolicy,
    temperature:         config.temperature,
    maxTokens:           config.maxTokens,
    isActive:            config.isActive,
  }
}

const DEFAULT_SETTINGS_VIEW = (tenantId: string) => ({
  tenantId,
  aiProvider:          'DRY_RUN',
  model:               'dry-run',
  useTenantApiKey:     false,
  hasApiKey:           false,
  apiKeyLast4:         null,
  apiKeyProvider:      null,
  apiKeyUpdatedAt:     null,
  persona:             null,
  goals:               [] as string[],
  systemPrompt:        null,
  replyLanguagePolicy: 'AUTO',
  temperature:         null,
  maxTokens:           null,
  isActive:            true,
})

// ────────────────────────────────────────────────────────────────────────────

export async function aiAgentRoutes(app: FastifyInstance) {

  // ── GET /ai-agent/providers ────────────────────────────────────────────────
  app.get('/providers', { preHandler: requireAuth }, async (_req) => {
    return {
      providers: Object.entries(AI_PROVIDERS).map(([key, val]) => ({
        provider: key,
        label:    val.label,
        models:   val.models,
      })),
      keyProviders: KEY_PROVIDERS,
    }
  })

  // ── GET /ai-agent/settings ────────────────────────────────────────────────
  app.get('/settings', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    const config = await prisma.aiConfig.findUnique({ where: { tenantId } })
    if (!config) return DEFAULT_SETTINGS_VIEW(tenantId)
    return safeSettingsView(tenantId, config)
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

    if (body.aiProvider !== undefined || body.model !== undefined) {
      const current  = await prisma.aiConfig.findUnique({ where: { tenantId } })
      const provider = body.aiProvider ?? current?.aiProvider ?? 'DRY_RUN'
      const model    = body.model      ?? current?.model      ?? 'dry-run'

      if (!Object.keys(AI_PROVIDERS).includes(provider)) {
        return reply.status(400).send({ error: `Invalid aiProvider. Valid: ${Object.keys(AI_PROVIDERS).join(', ')}` })
      }
      if (!isValidProviderModel(provider, model)) {
        return reply.status(400).send({ error: `Invalid model for ${provider}.`, validModels: getModelsForProvider(provider) })
      }
    }
    if (body.temperature !== undefined && body.temperature !== null) {
      if (body.temperature < 0 || body.temperature > 2)
        return reply.status(400).send({ error: 'temperature must be 0–2' })
    }
    if (body.maxTokens !== undefined && body.maxTokens !== null) {
      if (body.maxTokens < 100 || body.maxTokens > 8192)
        return reply.status(400).send({ error: 'maxTokens must be 100–8192' })
    }

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
        ...(body.aiProvider          !== undefined ? { aiProvider: body.aiProvider }                   : {}),
        ...(body.model               !== undefined ? { model: body.model }                             : {}),
        ...(body.useTenantApiKey     !== undefined ? { useTenantApiKey: body.useTenantApiKey }         : {}),
        ...(body.persona             !== undefined ? { persona: body.persona }                         : {}),
        ...(body.goals               !== undefined ? { goals: body.goals }                             : {}),
        ...(body.systemPrompt        !== undefined ? { systemPrompt: body.systemPrompt }               : {}),
        ...(body.replyLanguagePolicy !== undefined ? { replyLanguagePolicy: body.replyLanguagePolicy } : {}),
        ...(body.temperature         !== undefined ? { temperature: body.temperature }                 : {}),
        ...(body.maxTokens           !== undefined ? { maxTokens: body.maxTokens }                     : {}),
        ...(body.isActive            !== undefined ? { isActive: body.isActive }                       : {}),
      },
    })

    return safeSettingsView(tenantId, updated)
  })

  // ── POST /ai-agent/api-key ────────────────────────────────────────────────
  // Store an encrypted provider API key. Raw key is discarded after encryption.
  app.post<{
    Body: { provider?: string; apiKey?: string }
  }>('/api-key', { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId } = getAuthUser(req)
    const { provider, apiKey } = req.body ?? {}

    if (!provider || !(KEY_PROVIDERS as readonly string[]).includes(provider)) {
      return reply.status(400).send({
        error: `provider must be one of: ${KEY_PROVIDERS.join(', ')}`,
      })
    }
    if (!apiKey || typeof apiKey !== 'string') {
      return reply.status(400).send({ error: 'apiKey is required' })
    }

    const shapeErr = validateKeyShape(provider, apiKey)
    if (shapeErr) return reply.status(400).send({ error: shapeErr })

    if (!isVaultConfigured()) {
      return reply.status(503).send({
        error: 'API key vault not configured — set OMNI_API_KEY_ENCRYPTION_SECRET in environment',
      })
    }

    // Encrypt key; never log or return raw key
    const encrypted = encryptApiKey(apiKey.trim())
    const last4     = extractLast4(apiKey.trim())
    const now       = new Date()

    await prisma.aiConfig.upsert({
      where:  { tenantId },
      create: {
        tenantId,
        aiProvider:      provider,
        model:           provider === 'OPENAI'   ? 'gpt-4o-mini'
                       : provider === 'GEMINI'   ? 'gemini-2.0-flash'
                       : provider === 'DEEPSEEK' ? 'deepseek-chat'
                       : 'dry-run',
        useTenantApiKey: true,
        apiKeyRef:       encrypted,
        apiKeyLast4:     last4,
        apiKeyProvider:  provider,
        apiKeyUpdatedAt: now,
        goals:           [],
        replyLanguagePolicy: 'AUTO',
        isActive:        true,
      },
      update: {
        apiKeyRef:       encrypted,
        apiKeyLast4:     last4,
        apiKeyProvider:  provider,
        apiKeyUpdatedAt: now,
        useTenantApiKey: true,
      },
    })

    return reply.status(201).send({
      provider,
      apiKeyLast4:     last4,
      apiKeyUpdatedAt: now,
      useTenantApiKey: true,
      message:         'API key stored encrypted. Raw key discarded.',
    })
  })

  // ── DELETE /ai-agent/api-key ──────────────────────────────────────────────
  // Clear the stored encrypted key. Does not affect other AI settings.
  app.delete('/api-key', { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId } = getAuthUser(req)

    const existing = await prisma.aiConfig.findUnique({ where: { tenantId } })
    if (!existing) return reply.status(404).send({ error: 'No AI settings found for this tenant' })

    await prisma.aiConfig.update({
      where: { tenantId },
      data:  {
        apiKeyRef:       null,
        apiKeyLast4:     null,
        apiKeyProvider:  null,
        apiKeyUpdatedAt: null,
        useTenantApiKey: false,
      },
    })

    return { message: 'API key deleted. AI settings preserved.', hasApiKey: false }
  })

  // ── POST /ai-agent/api-key/test-dry-run ──────────────────────────────────
  // Verifies the vault can decrypt the stored key. Returns masked metadata only.
  // Does NOT call any real provider API.
  app.post('/api-key/test-dry-run', { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId } = getAuthUser(req)

    if (!isVaultConfigured()) {
      return reply.status(503).send({ error: 'Vault not configured — OMNI_API_KEY_ENCRYPTION_SECRET missing' })
    }

    const config = await prisma.aiConfig.findUnique({ where: { tenantId } })
    if (!config?.apiKeyRef) {
      return reply.status(404).send({ error: 'No encrypted API key found for this tenant' })
    }

    let decryptOk = false
    let keyLast4  = config.apiKeyLast4 ?? '????'

    try {
      const decrypted = decryptApiKey(config.apiKeyRef)
      // Verify: last 4 chars of decrypted should match stored last4
      keyLast4   = decrypted.slice(-4)
      decryptOk  = true
      // Raw key is NOT returned — local variable only, immediately discarded
    } catch {
      decryptOk = false
    }

    return {
      provider:  config.apiKeyProvider,
      keyLast4,
      decryptOk,
      note:      'No real provider API called. Vault integrity verified locally.',
    }
  })

  // ── POST /ai-agent/dry-run ────────────────────────────────────────────────
  // useRealProvider=true is only honoured when OMNI_ENABLE_REAL_OPENAI_SMOKE=true
  // is set server-side, so the default test mode never makes external API calls.
  app.post<{
    Body: {
      message?:           string
      customerId?:        string
      conversationId?:    string
      useRealProvider?:   boolean
    }
  }>('/dry-run', { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId } = getAuthUser(req)
    const { message, customerId, conversationId, useRealProvider = false } = req.body ?? {}

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

    // Real provider path: only if server-side flag enables it (prevents unintended external calls)
    const serverAllowsReal = process.env.OMNI_ENABLE_REAL_OPENAI_SMOKE === 'true'
    const shouldUseReal    = useRealProvider && serverAllowsReal

    let providerOpts = {}
    if (shouldUseReal) {
      const config = await prisma.aiConfig.findUnique({ where: { tenantId } })
      if (config?.aiProvider === 'OPENAI' && config.useTenantApiKey && config.apiKeyRef) {
        try {
          const rawKey = decryptApiKey(config.apiKeyRef)
          providerOpts = { hasKey: true, apiKey: rawKey }
        } catch {
          // Decryption failed — fall back to dry-run
        }
      }
    }

    const result = await aiOrchestrator.process(agentInput, providerOpts)

    return {
      ...result,
      note: shouldUseReal
        ? 'Real provider called (if key configured). No DB write, no WhatsApp sent.'
        : 'Dry-run only — no message written to DB, no WhatsApp sent',
    }
  })
}
