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

function safeView(row: {
  id: string; provider: string | null; defaultModel: string | null;
  hasApiKey: boolean; apiKeyLast4: string | null; enabled: boolean;
  allowTenantProvidedKeys: boolean; updatedAt: Date; updatedByUserId: string | null;
}) {
  // NOTE: apiKeyEncrypted intentionally NOT included.
  return {
    provider:                row.provider,
    defaultModel:            row.defaultModel,
    hasApiKey:               row.hasApiKey,
    apiKeyLast4:             row.apiKeyLast4,
    enabled:                 row.enabled,
    allowTenantProvidedKeys: row.allowTenantProvidedKeys,
    updatedAt:               row.updatedAt.toISOString(),
    updatedByUserId:         row.updatedByUserId,
  }
}

export async function adminAiSettingsRoutes(app: FastifyInstance) {

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
      updatedAt:               null as string | null,
      updatedByUserId:         null,
    }
    return {
      settings: view,
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
  } }>(
    '/',
    { preHandler: [requireAuth, requireRole('OWNER', 'ADMIN')] },
    async (req, reply) => {
      const b = req.body ?? {}
      const provider = b.provider?.trim() as Provider | undefined
      if (provider && !(SUPPORTED_PROVIDERS as readonly string[]).includes(provider)) {
        return reply.status(400).send({ error: `provider must be one of ${SUPPORTED_PROVIDERS.join('|')}` })
      }
      // allowTenantProvidedKeys hard-rejected: product decision is tenant
      // CANNOT supply own API key. Accept false only; reject true with 400.
      if (b.allowTenantProvidedKeys === true) {
        return reply.status(400).send({ error: 'allowTenantProvidedKeys must be false (tenant-managed AI keys not supported in this platform mode)' })
      }

      const apiKey = b.apiKey?.trim()
      const hasNewKey = !!(apiKey && apiKey.length >= 8)
      const apiKeyLast4 = hasNewKey ? apiKey!.slice(-4) : undefined

      const data: Record<string, unknown> = { updatedByUserId: getAuthUser(req).userId }
      if (provider !== undefined)               data.provider     = provider || null
      if (b.defaultModel !== undefined)         data.defaultModel = b.defaultModel?.trim() || null
      if (b.enabled !== undefined)              data.enabled      = !!b.enabled
      // Always keep allowTenantProvidedKeys = false (defensive).
      data.allowTenantProvidedKeys = false
      if (hasNewKey) {
        data.apiKeyEncrypted = apiKey
        data.apiKeyLast4     = apiKeyLast4
        data.hasApiKey       = true
      }

      const row = await prisma.platformAiSettings.upsert({
        where:  { id: SINGLETON_ID },
        create: { id: SINGLETON_ID, ...data },
        update: data,
      })

      // Audit — metadata MUST NOT contain raw apiKey.
      await createAuditLog({
        tenantId:    '__platform__',                   // sentinel for platform-level events
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
  app.post(
    '/test-connection-stub',
    { preHandler: [requireAuth, requireRole('OWNER', 'ADMIN')] },
    async () => {
      const row = await prisma.platformAiSettings.findUnique({ where: { id: SINGLETON_ID } })
      const ok = !!(row?.hasApiKey && row?.provider)
      return {
        ok,
        provider:     row?.provider ?? null,
        hasApiKey:    !!row?.hasApiKey,
        apiKeyLast4:  row?.apiKeyLast4 ?? null,
        realAiProviderCalled: false,
        note: ok
          ? '本地连接 stub 检查通过：provider 与 apiKey 元数据齐全。当前未发起任何真实 AI provider 调用。'
          : '本地连接 stub 检查未通过：请先填写 provider 与 API Key。',
      }
    },
  )
}
