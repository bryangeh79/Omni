// Round-9B: Service Access — tenant lifecycle status + enforcement helpers.
//
// serviceStatus values (string in DB; enum-like constants here):
//   TRIAL     — Pre-paid trial; all features work, watch trial expiry.
//   ACTIVE    — Normal paid service.
//   PAST_DUE  — Payment overdue; can still log in + view; show renewal warning.
//   SUSPENDED — SaaS Admin paused; AI/generation features blocked.
//   EXPIRED   — Contract ended; same restrictions as SUSPENDED.
//   CANCELLED — Customer cancelled; same restrictions as SUSPENDED.
//
// IMPORTANT: Never auto-deletes tenant data on suspension/expiry.
// View access (CRM read, account page) remains.

import { prisma } from '@omni/db'

export const SERVICE_STATUSES = ['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'EXPIRED', 'CANCELLED'] as const
export type ServiceStatus = typeof SERVICE_STATUSES[number]

export const SERVICE_STATUS_LABEL: Record<ServiceStatus, string> = {
  TRIAL:     '试用中',
  ACTIVE:    '正常服务',
  PAST_DUE:  '已逾期',
  SUSPENDED: '已暂停',
  EXPIRED:   '已到期',
  CANCELLED: '已取消',
}

/** Statuses that ALLOW the tenant to use AI generation / config write endpoints. */
const ACTIVE_LIKE: ReadonlySet<ServiceStatus> = new Set(['TRIAL', 'ACTIVE', 'PAST_DUE'])
/** Statuses that BLOCK the tenant from AI generation / config write endpoints. */
const BLOCKED_LIKE: ReadonlySet<ServiceStatus> = new Set(['SUSPENDED', 'EXPIRED', 'CANCELLED'])

export function isValidServiceStatus(s: unknown): s is ServiceStatus {
  return typeof s === 'string' && (SERVICE_STATUSES as readonly string[]).includes(s)
}

export interface TenantServiceAccess {
  serviceStatus:    ServiceStatus
  contractStartAt:  string | null
  contractEndAt:    string | null
  licenseCode:      string | null
  suspensionReason: string | null
  daysRemaining:    number | null
  isActiveLike:     boolean
  isBlocked:        boolean
  renewalWarning:   string | null
  tenantFacingBanner: string | null
}

export async function getTenantServiceAccess(tenantId: string): Promise<TenantServiceAccess> {
  const t = await prisma.tenant.findUnique({
    where:  { id: tenantId },
    select: { serviceStatus: true, contractStartAt: true, contractEndAt: true, licenseCode: true, suspensionReason: true },
  })
  const status = (isValidServiceStatus(t?.serviceStatus) ? t!.serviceStatus : 'TRIAL') as ServiceStatus
  const contractEnd = t?.contractEndAt ?? null
  const daysRemaining = contractEnd
    ? Math.max(0, Math.ceil((contractEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null

  const isActive  = ACTIVE_LIKE.has(status)
  const isBlocked = BLOCKED_LIKE.has(status)

  let renewalWarning: string | null = null
  if (status === 'PAST_DUE')                          renewalWarning = '账单已逾期，请尽快续费以避免服务暂停。'
  if (status === 'TRIAL' && daysRemaining !== null && daysRemaining <= 7) {
    renewalWarning = `试用还剩 ${daysRemaining} 天，请联系服务商正式开通。`
  }

  let tenantFacingBanner: string | null = null
  if (status === 'EXPIRED')   tenantFacingBanner = '您的服务已到期，请联系服务商续费。AI 回复与产品生成已暂时关闭，但您仍可查看已有资料。'
  if (status === 'SUSPENDED') tenantFacingBanner = '当前账号已暂停，AI 回复与产品生成已暂时关闭，但您仍可查看已有资料。如需恢复，请联系服务商。'
  if (status === 'CANCELLED') tenantFacingBanner = '账号已取消，AI 回复与产品生成已关闭。您仍可查看已有资料或导出数据。如需恢复请联系服务商。'
  if (status === 'PAST_DUE')  tenantFacingBanner = '账单已逾期，请尽快续费以避免服务暂停。'

  return {
    serviceStatus:     status,
    contractStartAt:   t?.contractStartAt?.toISOString() ?? null,
    contractEndAt:     t?.contractEndAt?.toISOString() ?? null,
    licenseCode:       t?.licenseCode ?? null,
    // NEVER expose internalNotes to tenant-facing accessors.
    suspensionReason:  t?.suspensionReason ?? null,
    daysRemaining,
    isActiveLike:      isActive,
    isBlocked,
    renewalWarning,
    tenantFacingBanner,
  }
}

/** Throws-style guard used inside Fastify handlers via try/catch OR check before action. */
export class ServiceAccessBlockedError extends Error {
  readonly status: ServiceStatus
  readonly cta:    string
  constructor(status: ServiceStatus) {
    super(`Service access blocked: ${status}`)
    this.status = status
    this.cta    = '服务已暂停或到期，请联系服务商续费'
  }
}

export async function requireServiceActive(tenantId: string): Promise<void> {
  const access = await getTenantServiceAccess(tenantId)
  if (access.isBlocked) {
    throw new ServiceAccessBlockedError(access.serviceStatus)
  }
}

/** Compute next license code (internal SaaS Admin tracking, not customer-entered). */
export function suggestLicenseCode(plan: string, ordinal: number): string {
  const year = new Date().getUTCFullYear()
  const padded = String(ordinal).padStart(5, '0')
  return `OMNI-${plan.toUpperCase()}-${year}-${padded}`
}
