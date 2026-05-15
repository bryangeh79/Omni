// Round-9A: Quota / billing-state helpers.
//
// All functions operate on the per-tenant TenantBillingState row.
// Functions are idempotent for stub purchase events (externalEventId guard).
// No real payment provider calls. No secrets stored.

import { prisma } from '@omni/db'
import { getPlan, getAddOn, type PlanId, type AddOnDef } from './plans'

function nowIso(): string { return new Date().toISOString() }
function ym(d: Date = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

// `faqDirectReplies` is a Round-9C foundation counter for "FAQ matched, sent
// directly (no AI generation, no AI Reply credit deduction)". It is read by
// the tenant-facing quota counter UI; no endpoint deducts from it yet — the
// inbox FAQ dispatcher will increment it when wired in a later Round.
export interface MonthlyUsage { faqGenerations: number; aiReplies: number; faqDirectReplies?: number }
export interface PurchasedCredits { faq: number; aiReply: number }

export interface ActiveAddOn {
  id:           string
  kind:         AddOnDef['kind']
  tier:         AddOnDef['tier']
  slots?:       number
  credits?:     number
  priceRm:      number
  recurring:    AddOnDef['recurring']
  purchasedAt:  string
  expiresAt?:   string
}

export interface LedgerEntry {
  id:               string
  eventType:        'purchase_intent' | 'payment_event'
  status:           'pending' | 'success' | 'failed'
  externalEventId?: string                       // idempotency guard
  payload:          Record<string, unknown>      // sanitized (no secrets)
  beforeBalance:    { addOnsActive: number; faq: number; aiReply: number }
  afterBalance:     { addOnsActive: number; faq: number; aiReply: number }
  at:               string
  note?:            string
}

export interface QuotaSummary {
  plan: {
    id:                  PlanId
    name:                string
    priceRm:             number
    period:              'monthly'
    metaApiFeeIncluded:  false
    metaApiFeeNote:      string
    visibleRoles:        string[]
    aiSmartReplyDefault: boolean
    launchCommitmentOffer?: PlanDefLaunchOffer
  }
  aiSmartReplyEnabled: boolean
  whatsapp:    Counter
  products:    Counter
  faq:         CounterWithCredits
  aiReply:     CounterWithCredits
  teamUsers:   Counter
  /** Round-9C: FAQ matched-and-sent count (no AI generation, no credit deduction). */
  faqDirectReplies: number
  warnings:    string[]           // friendly messages when ≥80%, ≥90%, =100%
  cta: {
    productExpansion?: string
    faqCredits?:       string
    aiReplyCredits?:   string
  }
  /** Round-9C: tenant cannot self-select plan; SaaS Admin provisions plan. */
  tenantCanChangePlan: false
  /** Round-9C: tenant uses platform-hosted AI; no tenant API key required. */
  platformHostedAi:    true
}

interface PlanDefLaunchOffer { priceRm: number; period: 'monthly'; commitmentMonths: number; upfront: number; originalSixMonth: number; savings: number; note: string }
interface Counter {
  included:  number
  used:      number
  remaining: number
  overLimit: boolean
}
interface CounterWithCredits extends Counter {
  monthlyIncluded:    number
  monthlyUsed:        number
  monthlyRemaining:   number
  purchasedCredits:   number
  totalRemaining:     number
}

// ── State accessor ─────────────────────────────────────────────────────────

interface BillingStateRow {
  id:                  string
  tenantId:            string
  aiSmartReplyEnabled: boolean
  currentMonthKey:     string
  monthlyUsage:        unknown
  addOnsActive:        unknown
  purchasedCredits:    unknown
  ledger:              unknown
  createdAt:           Date
  updatedAt:           Date
}

export async function getOrCreateBillingState(tenantId: string): Promise<BillingStateRow> {
  const key = ym()
  let state = await prisma.tenantBillingState.findUnique({ where: { tenantId } })
  if (!state) {
    state = await prisma.tenantBillingState.create({
      data: { tenantId, currentMonthKey: key },
    })
    return state
  }
  // Auto-reset monthly counters on month rollover.
  if (state.currentMonthKey !== key) {
    state = await prisma.tenantBillingState.update({
      where: { tenantId },
      data:  {
        currentMonthKey: key,
        monthlyUsage:    { faqGenerations: 0, aiReplies: 0 },
      },
    })
  }
  return state
}

export async function getQuotaSummary(tenantId: string, planId: string, usedProductSlots: number, usedWhatsapp: number, usedTeamUsers: number): Promise<QuotaSummary> {
  const state = await getOrCreateBillingState(tenantId)
  const plan  = getPlan(planId)
  const usage = state.monthlyUsage as unknown as MonthlyUsage
  const credits = state.purchasedCredits as unknown as PurchasedCredits
  const addOns = state.addOnsActive as unknown as ActiveAddOn[]

  // Sum extra slots from active product_expansion add-ons.
  const extraSlots = addOns
    .filter(a => a.kind === 'product_expansion' && (!a.expiresAt || a.expiresAt > nowIso()))
    .reduce((sum, a) => sum + (a.slots ?? 0), 0)
  const totalProductSlots = plan.productSlots + extraSlots

  // Counter builders
  const wha: Counter = {
    included:  plan.whatsappConnections,
    used:      usedWhatsapp,
    remaining: Math.max(0, plan.whatsappConnections - usedWhatsapp),
    overLimit: usedWhatsapp > plan.whatsappConnections,
  }
  const prod: Counter = {
    included:  totalProductSlots,
    used:      usedProductSlots,
    remaining: Math.max(0, totalProductSlots - usedProductSlots),
    overLimit: usedProductSlots > totalProductSlots,
  }
  const team: Counter = {
    included:  plan.teamUsers,
    used:      usedTeamUsers,
    remaining: Math.max(0, plan.teamUsers - usedTeamUsers),
    overLimit: usedTeamUsers > plan.teamUsers,
  }
  const faq: CounterWithCredits = buildCounterWithCredits(plan.aiFaqGenerationsPerMonth, usage.faqGenerations, credits.faq)
  const aiReply: CounterWithCredits = buildCounterWithCredits(plan.aiRepliesPerMonth, usage.aiReplies, credits.aiReply)

  const warnings: string[] = []
  for (const [label, c] of [
    ['产品位', prod],
    ['团队用户', team],
    ['WhatsApp 连接', wha],
  ] as Array<[string, Counter]>) {
    if (c.overLimit)                       warnings.push(`${label}已超额（${c.used}/${c.included}）`)
    else if (c.included > 0) {
      const pct = c.used / c.included
      if (pct >= 1)        warnings.push(`${label}已用完`)
      else if (pct >= 0.9) warnings.push(`${label}使用率 ≥ 90%`)
      else if (pct >= 0.8) warnings.push(`${label}使用率 ≥ 80%`)
    }
  }
  for (const [label, c] of [
    ['AI FAQ 生成', faq],
    ['AI 回复', aiReply],
  ] as Array<[string, CounterWithCredits]>) {
    if (c.totalRemaining <= 0)                    warnings.push(`${label}配额已用完`)
    else if (c.included > 0 && c.used / c.included >= 0.9) warnings.push(`${label}使用率 ≥ 90%`)
    else if (c.included > 0 && c.used / c.included >= 0.8) warnings.push(`${label}使用率 ≥ 80%`)
  }

  return {
    plan: {
      id:                  plan.id,
      name:                plan.name,
      priceRm:             plan.priceRm,
      period:              plan.period,
      metaApiFeeIncluded:  false,
      metaApiFeeNote:      'Meta 官方 WhatsApp API 费用为 pass-through，不包含在套餐内。',
      visibleRoles:        plan.visibleRoles as string[],
      aiSmartReplyDefault: plan.aiSmartReplyDefault,
      launchCommitmentOffer: plan.launchCommitmentOffer,
    },
    aiSmartReplyEnabled: state.aiSmartReplyEnabled,
    whatsapp:  wha,
    products:  prod,
    faq,
    aiReply,
    teamUsers: team,
    faqDirectReplies: Math.max(0, Math.floor(usage.faqDirectReplies ?? 0)),
    warnings,
    cta: {
      productExpansion: prod.remaining <= 0 ? '购买产品扩容包' : undefined,
      faqCredits:       faq.totalRemaining <= 0 ? '购买 AI FAQ 生成包' : undefined,
      aiReplyCredits:   aiReply.totalRemaining <= 0 ? '购买 AI 回复包' : undefined,
    },
    tenantCanChangePlan: false,
    platformHostedAi:    true,
  }
}

function buildCounterWithCredits(monthlyIncluded: number, monthlyUsed: number, purchasedCredits: number): CounterWithCredits {
  const monthlyRemaining = Math.max(0, monthlyIncluded - monthlyUsed)
  const totalRemaining   = monthlyRemaining + Math.max(0, purchasedCredits)
  return {
    included:         monthlyIncluded,
    used:             monthlyUsed,
    remaining:        monthlyRemaining,
    overLimit:        monthlyUsed > monthlyIncluded,
    monthlyIncluded,
    monthlyUsed,
    monthlyRemaining,
    purchasedCredits: Math.max(0, purchasedCredits),
    totalRemaining,
  }
}

// ── Quota deduction ────────────────────────────────────────────────────────

/**
 * Attempt to deduct 1 FAQ generation.
 * Monthly quota consumed first, then purchased credits.
 * Returns { ok, remaining, cta } — if ok=false, caller should respond 429 with cta.
 */
export async function tryDeductFaqGeneration(tenantId: string, planId: string): Promise<{ ok: boolean; remaining: number; cta?: string }> {
  const state  = await getOrCreateBillingState(tenantId)
  const plan   = getPlan(planId)
  const usage  = state.monthlyUsage as unknown as MonthlyUsage
  const credits= state.purchasedCredits as unknown as PurchasedCredits

  const monthlyRemaining = Math.max(0, plan.aiFaqGenerationsPerMonth - usage.faqGenerations)
  if (monthlyRemaining > 0) {
    await prisma.tenantBillingState.update({
      where: { tenantId },
      data:  { monthlyUsage: { ...usage, faqGenerations: usage.faqGenerations + 1 } },
    })
    return { ok: true, remaining: monthlyRemaining - 1 + credits.faq }
  }
  if (credits.faq > 0) {
    await prisma.tenantBillingState.update({
      where: { tenantId },
      data:  { purchasedCredits: { ...credits, faq: credits.faq - 1 } },
    })
    return { ok: true, remaining: credits.faq - 1 }
  }
  return { ok: false, remaining: 0, cta: '购买 AI FAQ 生成包' }
}

/**
 * Attempt to deduct 1 AI Reply credit.
 * ONLY called when an AI model is actually invoked. Manual replies, fixed templates,
 * direct FAQ lookups, and safe fallbacks MUST NOT call this helper.
 */
export async function tryDeductAiReplyCredit(tenantId: string, planId: string): Promise<{ ok: boolean; remaining: number; cta?: string }> {
  const state  = await getOrCreateBillingState(tenantId)
  const plan   = getPlan(planId)
  const usage  = state.monthlyUsage as unknown as MonthlyUsage
  const credits= state.purchasedCredits as unknown as PurchasedCredits

  const monthlyRemaining = Math.max(0, plan.aiRepliesPerMonth - usage.aiReplies)
  if (monthlyRemaining > 0) {
    await prisma.tenantBillingState.update({
      where: { tenantId },
      data:  { monthlyUsage: { ...usage, aiReplies: usage.aiReplies + 1 } },
    })
    return { ok: true, remaining: monthlyRemaining - 1 + credits.aiReply }
  }
  if (credits.aiReply > 0) {
    await prisma.tenantBillingState.update({
      where: { tenantId },
      data:  { purchasedCredits: { ...credits, aiReply: credits.aiReply - 1 } },
    })
    return { ok: true, remaining: credits.aiReply - 1 }
  }
  return { ok: false, remaining: 0, cta: '购买 AI 回复包' }
}

// ── AI Smart Reply toggle ──────────────────────────────────────────────────

export async function setAiSmartReplyEnabled(tenantId: string, enabled: boolean): Promise<boolean> {
  await getOrCreateBillingState(tenantId)
  const updated = await prisma.tenantBillingState.update({
    where: { tenantId },
    data:  { aiSmartReplyEnabled: enabled },
    select:{ aiSmartReplyEnabled: true },
  })
  return updated.aiSmartReplyEnabled
}

// ── Purchase intent / stub payment event ───────────────────────────────────

export async function createPurchaseIntent(tenantId: string, addOnId: string): Promise<{ intentId: string; addOn: AddOnDef }> {
  const addOn = getAddOn(addOnId)
  if (!addOn) throw new Error(`Unknown add-on: ${addOnId}`)

  const state = await getOrCreateBillingState(tenantId)
  const credits = state.purchasedCredits as unknown as PurchasedCredits
  const addOns  = state.addOnsActive as unknown as ActiveAddOn[]
  const ledger  = state.ledger as unknown as LedgerEntry[]

  const intentId = `pi_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  const entry: LedgerEntry = {
    id:        intentId,
    eventType: 'purchase_intent',
    status:    'pending',
    payload:   { addOnId, priceRm: addOn.priceRm, kind: addOn.kind, tier: addOn.tier },
    beforeBalance: { addOnsActive: addOns.length, faq: credits.faq, aiReply: credits.aiReply },
    afterBalance:  { addOnsActive: addOns.length, faq: credits.faq, aiReply: credits.aiReply },
    at:        nowIso(),
    note:      '已创建购买意向，等待付款（stub mode；未真实扣费）。',
  }
  await prisma.tenantBillingState.update({
    where: { tenantId },
    data:  { ledger: [...ledger, entry] as unknown as object },
  })
  return { intentId, addOn }
}

/**
 * Stub payment event processor.
 * Real payment gateway integration NOT done. This is the integration seam for a future
 * Stripe/Razorpay webhook handler. For now it accepts trusted server-side calls.
 *
 * Idempotency: if externalEventId already present in ledger, return previously recorded result.
 * Only `status === 'success'` adds credits/slots. `pending` and `failed` do not.
 */
export async function processStubPaymentEvent(
  tenantId: string,
  args: { intentId: string; externalEventId: string; status: 'success' | 'failed' | 'pending'; note?: string },
): Promise<{ applied: boolean; status: string; ledgerEntryId: string; alreadyProcessed: boolean }> {
  const state   = await getOrCreateBillingState(tenantId)
  const ledger  = state.ledger as unknown as LedgerEntry[]
  const credits = state.purchasedCredits as unknown as PurchasedCredits
  const addOns  = state.addOnsActive as unknown as ActiveAddOn[]

  // Idempotency: bail if the same externalEventId has already been recorded.
  const dup = ledger.find(l => l.externalEventId === args.externalEventId && l.eventType === 'payment_event')
  if (dup) {
    return { applied: false, status: dup.status, ledgerEntryId: dup.id, alreadyProcessed: true }
  }

  const intent = ledger.find(l => l.id === args.intentId && l.eventType === 'purchase_intent')
  if (!intent) throw new Error(`Unknown intentId: ${args.intentId}`)
  const addOn = getAddOn((intent.payload as Record<string, unknown>).addOnId as string)
  if (!addOn) throw new Error(`Add-on missing for intent ${args.intentId}`)

  const newCredits = { ...credits }
  const newAddOns  = [...addOns]
  let applied      = false

  if (args.status === 'success') {
    applied = true
    if (addOn.kind === 'product_expansion') {
      newAddOns.push({
        id:           addOn.id,
        kind:         addOn.kind,
        tier:         addOn.tier,
        slots:        addOn.slots,
        priceRm:      addOn.priceRm,
        recurring:    addOn.recurring,
        purchasedAt:  nowIso(),
        // recurring monthly — no fixed expiresAt; tenant can cancel later.
      })
    } else if (addOn.kind === 'faq_credits') {
      newCredits.faq    = (newCredits.faq    ?? 0) + (addOn.credits ?? 0)
    } else if (addOn.kind === 'ai_reply_credits') {
      newCredits.aiReply= (newCredits.aiReply?? 0) + (addOn.credits ?? 0)
    }
  }

  const entryId = `pe_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  const entry: LedgerEntry = {
    id:               entryId,
    eventType:        'payment_event',
    status:           args.status,
    externalEventId:  args.externalEventId,
    payload:          { intentId: args.intentId, addOnId: addOn.id, status: args.status },
    beforeBalance:    { addOnsActive: addOns.length,    faq: credits.faq,    aiReply: credits.aiReply },
    afterBalance:     { addOnsActive: newAddOns.length, faq: newCredits.faq, aiReply: newCredits.aiReply },
    at:               nowIso(),
    note:             args.note ?? (applied ? '付款成功，已记入余额（stub mode）' : 'pending / failed — 未应用任何余额变更（stub mode）'),
  }
  const nextLedger = [...ledger, entry]

  await prisma.tenantBillingState.update({
    where: { tenantId },
    data:  {
      ledger:           nextLedger as unknown as object,
      purchasedCredits: newCredits as unknown as object,
      addOnsActive:     newAddOns  as unknown as object,
    },
  })

  return { applied, status: args.status, ledgerEntryId: entryId, alreadyProcessed: false }
}
