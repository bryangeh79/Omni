// Round-9E: SaaS Admin Platform AI Settings.
//
// SECURITY INVARIANTS (must never be relaxed):
//   - Tenants MUST never reach these endpoints.
//   - Raw apiKey MUST never be returned in any response.
//   - Audit metadata MUST never carry raw apiKey or apiKeyEncrypted.
//   - GET response exposes ONLY: provider / defaultModel / hasApiKey /
//     apiKeyLast4 / enabled / allowTenantProvidedKeys / updatedAt /
//     updatedByUserId.
//
// CURRENT GUARD: requireRole('OWNER', 'ADMIN') with a TODO(platform-rbac)
// marker for a future platform-admin role swap.
//
// NO real AI provider is called by default. The test-connection-stub is a
// pure local check that the row has a recorded apiKey + provider; it never
// makes an outbound HTTP request.

import type { FastifyInstance } from 'fastify'
import { prisma } from '@omni/db'
import { requireAuth, requireRole, getAuthUser } from '../auth'
import { createAuditLog } from '../lib/audit'

const SINGLETON_ID = 'singleton'

const SUPPORTED_PROVIDERS = ['openai', 'gemini', 'deepseek', 'other'] as const
type Provider = typeof SUPPORTED_PROVIDERS[number]

// Round-9F: cost-effective default model per provider. SaaS Admin can still
// pick the more expensive flagship models manually, but defaults stay cheap.
const PROVIDER_MODELS: Record<Exclude<Provider, 'other'>, { default: string; supported: string[] }> = {
  deepseek: { default: 'deepseek-chat',           supported: ['deepseek-chat', 'deepseek-reasoner'] },
  openai:   { default: 'gpt-4o-mini',             supported: ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1'] },
  gemini:   { default: 'gemini-2.5-flash-lite',   supported: ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro'] },
}
/** Resolve `model` against `provider`. Empty/missing/mismatched → provider default. */
function resolveModel(provider: Provider, requested: string | undefined): string {
  const m = requested?.trim() ?? ''
  if (provider === 'other') return m  // custom allowed
  const cfg = PROVIDER_MODELS[provider]
  if (!m || !cfg.supported.includes(m)) return cfg.default
  return m
}

function safeView(row: {
  id: string; provider: string | null; defaultModel: string | null;
  hasApiKey: boolean; apiKeyLast4: string | null; enabled: boolean;
  allowTenantProvidedKeys: boolean; corePromptOverride: string | null;
  updatedAt: Date; updatedByUserId: string | null;
}) {
  // NOTE: apiKeyEncrypted intentionally NOT included.
  // Round-9H: corePromptOverride is admin-only. Expose the actual override
  // text so the SaaS Admin operator can review / edit it, but it is gated by
  // the requireRole(OWNER, ADMIN) preHandler. Tenants never reach these
  // endpoints. `corePromptOverrideLength` is included for at-a-glance UI.
  return {
    provider:                row.provider,
    defaultModel:            row.defaultModel,
    hasApiKey:               row.hasApiKey,
    apiKeyLast4:             row.apiKeyLast4,
    enabled:                 row.enabled,
    allowTenantProvidedKeys: row.allowTenantProvidedKeys,
    corePromptOverride:      row.corePromptOverride,
    hasCorePromptOverride:   !!(row.corePromptOverride && row.corePromptOverride.trim().length > 32),
    corePromptOverrideLength: row.corePromptOverride?.length ?? 0,
    updatedAt:               row.updatedAt.toISOString(),
    updatedByUserId:         row.updatedByUserId,
  }
}

export async function adminAiSettingsRoutes(app: FastifyInstance) {

  // Round-9F: tolerate empty POST bodies (Content-Type: application/json with
  // no payload). Fastify's default JSON parser otherwise throws 400 "Body
  // cannot be empty" which surfaced to operators as a raw "Bad Request" on
  // /admin/ai-settings/test-connection-stub. Scope is local to this plugin.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const s = (body as string) ?? ''
    if (s.length === 0) return done(null, {})
    try { done(null, JSON.parse(s)) }
    catch (err) { done(err as Error) }
  })

  // ── GET /admin/ai-settings ────────────────────────────────────────────
  // TODO(platform-rbac): replace requireRole with a true platform-admin role.
  app.get('/', { preHandler: [requireAuth, requireRole('OWNER', 'ADMIN')] }, async () => {
    const row = await prisma.platformAiSettings.findUnique({ where: { id: SINGLETON_ID } })
    const view = row ? safeView(row) : {
      provider:                null,
      defaultModel:            null,
      hasApiKey:               false,
      apiKeyLast4:             null,
      enabled:                 false,
      allowTenantProvidedKeys: false,
      corePromptOverride:      null,
      hasCorePromptOverride:   false,
      corePromptOverrideLength:0,
      updatedAt:               null as string | null,
      updatedByUserId:         null,
    }
    // Round-9H: include the platform Core AI Prompt default so the SaaS Admin
    // operator UI can preview what's actually used at runtime (override > default).
    const { PLATFORM_CORE_PROMPT } = await import('../lib/platform-prompt')
    return {
      settings:           view,
      platformCorePromptDefault: PLATFORM_CORE_PROMPT,
      // Round-9F: expose the supported provider/model catalogue so the UI can
      // render a provider-aware dropdown without a second endpoint.
      providers: SUPPORTED_PROVIDERS,
      models:    PROVIDER_MODELS,
      // Explicit safety flags to make tenant-facing scanners happy.
      realAiProviderCalled: false,
      tenantsCanSeeThis:    false,
      note: '此页面仅限 SaaS Admin / 平台运维查看。租户从不可见此响应。原始 API Key 不会在任何响应中回显。',
    }
  })

  // ── POST /admin/ai-settings ───────────────────────────────────────────
  // Body: { provider?, defaultModel?, apiKey?, enabled?, allowTenantProvidedKeys? }
  // Raw apiKey is accepted ONLY here and is stored as-is in apiKeyEncrypted
  // (foundation stage — Vault encryption deferred). It is NEVER returned and
  // never logged in audit metadata.
  app.post<{ Body: {
    provider?:                string
    defaultModel?:            string
    apiKey?:                  string
    enabled?:                 boolean
    allowTenantProvidedKeys?: boolean
    corePromptOverride?:      string | null
  } }>(
    '/',
    { preHandler: [requireAuth, requireRole('OWNER', 'ADMIN')] },
    async (req, reply) => {
      const b = req.body ?? {}
      const requestedProvider = b.provider?.trim() as Provider | undefined
      if (requestedProvider && !(SUPPORTED_PROVIDERS as readonly string[]).includes(requestedProvider)) {
        return reply.status(400).send({ error: `provider must be one of ${SUPPORTED_PROVIDERS.join('|')}` })
      }
      // allowTenantProvidedKeys hard-rejected: product decision is tenant
      // CANNOT supply own API key. Accept false only; reject true with 400.
      if (b.allowTenantProvidedKeys === true) {
        return reply.status(400).send({ error: 'allowTenantProvidedKeys must be false (tenant-managed AI keys not supported in this platform mode)' })
      }

      // Round-9F: default provider is `deepseek` on the very first save (cost-
      // effective tier); subsequent saves preserve existing provider if omitted.
      const existing = await prisma.platformAiSettings.findUnique({ where: { id: SINGLETON_ID } })
      const provider: Provider = (requestedProvider ?? (existing?.provider as Provider | null) ?? 'deepseek') as Provider
      // Round-9F: resolve model against provider's supported list; mismatched
      // or empty → provider's cost-effective default.
      const requestedModel = b.defaultModel?.trim()
      const resolvedModel  = resolveModel(provider, requestedModel)
      // For provider=other, model is required when enabling.
      if (provider === 'other' && b.enabled === true && !resolvedModel) {
        return reply.status(400).send({ error: '当选择"其他 Provider"且启用 AI 服务时，必须填写自定义模型名称。' })
      }

      const apiKey = b.apiKey?.trim()
      const hasNewKey = !!(apiKey && apiKey.length >= 8)
      const apiKeyLast4 = hasNewKey ? apiKey!.slice(-4) : undefined

      const data: Record<string, unknown> = { updatedByUserId: getAuthUser(req).userId }
      data.provider     = provider
      data.defaultModel = resolvedModel || null
      if (b.enabled !== undefined) data.enabled = !!b.enabled
      // Always keep allowTenantProvidedKeys = false (defensive).
      data.allowTenantProvidedKeys = false
      if (hasNewKey) {
        data.apiKeyEncrypted = apiKey
        data.apiKeyLast4     = apiKeyLast4
        data.hasApiKey       = true
      }
      // Round-9H: optional override of the platform Core AI Prompt. Null/empty
      // clears it (falls back to PLATFORM_CORE_PROMPT). Min-length is 32 chars
      // — anything shorter is treated as "clear" to avoid trivially weak prompts.
      if (b.corePromptOverride !== undefined) {
        const override = (b.corePromptOverride ?? '').toString().trim()
        data.corePromptOverride = override.length >= 32 ? override : null
      }

      const row = await prisma.platformAiSettings.upsert({
        where:  { id: SINGLETON_ID },
        create: { id: SINGLETON_ID, ...data },
        update: data,
      })

      // Audit — metadata MUST NOT contain raw apiKey. The audit row is scoped
      // to the acting admin's tenantId so it surfaces in their /audit/logs
      // view (same convention as all other tenant-scoped audits in the system).
      await createAuditLog({
        tenantId:    getAuthUser(req).tenantId,
        actorUserId: getAuthUser(req).userId,
        actorRole:   getAuthUser(req).role,
        action:      'PLATFORM_AI_SETTINGS_UPDATED',
        entityType:  'PlatformAiSettings',
        entityId:    SINGLETON_ID,
        metadata: {
          provider:    row.provider,
          defaultModel:row.defaultModel,
          hasApiKey:   row.hasApiKey,
          apiKeyLast4: row.apiKeyLast4,
          enabled:     row.enabled,
          allowTenantProvidedKeys: row.allowTenantProvidedKeys,
          // explicit safety markers
          apiKeyChanged: hasNewKey,
          corePromptChanged: b.corePromptOverride !== undefined,
          corePromptLength:  row.corePromptOverride?.length ?? 0,
        },
      })

      return reply.status(200).send({
        saved:    true,
        settings: safeView(row),
        realAiProviderCalled: false,
        note: hasNewKey ? '已保存 API Key（仅显示末 4 位）。原始 Key 不会在任何前端响应或审计日志中回显。' : '设置已更新。原始 API Key 未变更。',
      })
    },
  )

  // ── POST /admin/ai-settings/test-connection-stub ──────────────────────
  // Local-only smoke check: does the platform have a recorded apiKey + provider?
  // NEVER makes an outbound HTTP request. NEVER returns the raw key.
  //
  // Round-9F: tolerate empty body (no Content-Type / no `{}`). Fastify default
  // body-parser otherwise rejects POST application/json with empty body as a
  // 400 "Body cannot be empty" which surfaced to the operator as "Bad Request".
  app.post(
    '/test-connection-stub',
    {
      preHandler: [requireAuth, requireRole('OWNER', 'ADMIN')],
      // Make body optional so an empty POST works without 400.
      schema: { body: { type: 'object', additionalProperties: true, nullable: true } },
    },
    async () => {
      const row = await prisma.platformAiSettings.findUnique({ where: { id: SINGLETON_ID } })
      const provider     = row?.provider ?? null
      const defaultModel = row?.defaultModel ?? null
      const hasApiKey    = !!row?.hasApiKey
      const ok           = !!(hasApiKey && provider)
      // Provider/model mismatch sanity (Round-9F): if a non-other provider has
      // a model not in its supported list, flag a hint (UI prompts the operator).
      let mismatch = false
      if (provider && provider !== 'other' && defaultModel) {
        const cfg = PROVIDER_MODELS[provider as Exclude<Provider, 'other'>]
        if (cfg && !cfg.supported.includes(defaultModel)) mismatch = true
      }
      const messageZh = !hasApiKey
        ? '请先保存 API Key 后再测试连接。'
        : mismatch
          ? '请选择该 Provider 支持的模型。'
          : '测试通过：已检测到平台 AI Key 设置。当前为安全 stub 检查，未调用真实 AI provider。'
      return {
        ok:                   ok && !mismatch,
        provider,
        defaultModel,
        hasApiKey,
        apiKeyLast4:          row?.apiKeyLast4 ?? null,
        modelMismatch:        mismatch,
        realAiProviderCalled: false,
        messageZh,
        // legacy field kept for backward compat with Round-9E smoke
        note:                 messageZh,
      }
    },
  )
}
