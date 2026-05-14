// Round-9A: Plan + Add-on definitions (single source of truth).
//
// IMPORTANT:
// - Meta 官方 WhatsApp API 费用 (`metaApiFee`) is pass-through. Not part of plan price.
//   Displayed/billed separately in future. The Starter / Pro RM price below does NOT
//   include any Meta API usage.
// - Pro RM299/month is ONLY the 6-month Launch Commitment Offer.
//   Pro normal monthly price is RM399. Never round-trip RM299 as the normal monthly.

export type PlanId = 'starter' | 'pro' | 'business' | 'trial'

export interface PlanDef {
  id:                       PlanId
  name:                     string
  priceRm:                  number          // monthly normal price
  period:                   'monthly'       // current foundation only supports monthly
  whatsappConnections:      number
  productSlots:             number
  aiFaqGenerationsPerMonth: number
  aiRepliesPerMonth:        number
  teamUsers:                number
  features:                 string[]        // display-only feature list (zh)
  aiSmartReplyDefault:      boolean
  visibleRoles:             ('admin' | 'user')[]
  metaApiFeeIncluded:       false           // always false — Meta API is pass-through
  launchCommitmentOffer?:   {
    priceRm:           number               // offer monthly price
    period:            'monthly'
    commitmentMonths:  number               // e.g. 6
    upfront:           number               // total prepaid at offer rate
    originalSixMonth:  number               // total at normal monthly × commitmentMonths
    savings:           number
    note:              string
  }
}

export const PLANS: Record<PlanId, PlanDef> = {
  trial: {
    id: 'trial', name: '试用版', priceRm: 0, period: 'monthly',
    whatsappConnections: 1, productSlots: 3, aiFaqGenerationsPerMonth: 3, aiRepliesPerMonth: 100,
    teamUsers: 1,
    features: ['仅供体验，限时'],
    aiSmartReplyDefault: true, visibleRoles: ['admin'], metaApiFeeIncluded: false,
  },
  starter: {
    id: 'starter', name: 'Starter 基础版', priceRm: 199, period: 'monthly',
    whatsappConnections: 1,
    productSlots: 10,
    aiFaqGenerationsPerMonth: 10,
    aiRepliesPerMonth: 1000,
    teamUsers: 1,
    features: [
      '1 个普通 WhatsApp / WhatsApp Business App 连接',
      '10 个有效产品 / 服务配置位',
      '10 次 AI FAQ 生成 / 月',
      '1,000 条 AI 客户回复 / 月',
      '基础 CRM · 基础意向评分 · 基础自动跟进',
      '基础老板今日工作台',
      'AI 智能回复默认开启',
    ],
    aiSmartReplyDefault: true,
    visibleRoles: ['admin'],
    metaApiFeeIncluded: false,
  },
  pro: {
    id: 'pro', name: 'Pro 成长版', priceRm: 399, period: 'monthly',
    whatsappConnections: 3,
    productSlots: 30,
    aiFaqGenerationsPerMonth: 50,
    aiRepliesPerMonth: 5000,
    teamUsers: 5,
    features: [
      '3 个普通 WhatsApp / WhatsApp Business App 连接',
      '30 个有效产品 / 服务配置位',
      '50 次 AI FAQ 生成 / 月',
      '5,000 条 AI 客户回复 / 月',
      '5 个团队用户（Admin / User）',
      '完整 CRM · 完整意向评分 · 销售管道 · 高级自动跟进',
      '高意向告警 · 完整老板工作台',
      'AI 智能回复默认开启',
    ],
    aiSmartReplyDefault: true,
    visibleRoles: ['admin', 'user'],
    metaApiFeeIncluded: false,
    launchCommitmentOffer: {
      priceRm: 299,
      period: 'monthly',
      commitmentMonths: 6,
      upfront: 1794,
      originalSixMonth: 2394,
      savings: 600,
      note: 'RM299/月仅作为 6 个月 Launch Commitment Offer 提供；非正常月度价（正常 RM399/月）。',
    },
  },
  business: {
    id: 'business', name: 'Business 企业版', priceRm: 999, period: 'monthly',
    whatsappConnections: 10, productSlots: 100,
    aiFaqGenerationsPerMonth: 200, aiRepliesPerMonth: 30000,
    teamUsers: 20,
    features: ['面向企业；详细配置请联系销售'],
    aiSmartReplyDefault: true,
    visibleRoles: ['admin', 'user'],
    metaApiFeeIncluded: false,
  },
}

export const META_API_FEE_NOTE =
  'Meta 官方 WhatsApp API 费用为 pass-through，不包含在套餐内，将以独立的 API usage 形式计费。'

// ── Add-ons ────────────────────────────────────────────────────────────────

export type AddOnTier = 'S' | 'M' | 'L'

export interface AddOnDef {
  id:        string
  kind:      'product_expansion' | 'faq_credits' | 'ai_reply_credits'
  tier:      AddOnTier
  priceRm:   number
  recurring: 'monthly' | 'one_time'
  validMonths?: number      // for one-time credits
  slots?:    number         // product_expansion
  credits?:  number         // faq_credits / ai_reply_credits
  label:     string
}

export const ADD_ONS: AddOnDef[] = [
  // Product Expansion Pack — recurring monthly, stackable
  { id: 'product_exp_s', kind: 'product_expansion', tier: 'S', slots: 5,   priceRm: 29,  recurring: 'monthly', label: '产品扩容包 S · +5 个产品位 · RM29 / 月' },
  { id: 'product_exp_m', kind: 'product_expansion', tier: 'M', slots: 15,  priceRm: 79,  recurring: 'monthly', label: '产品扩容包 M · +15 个产品位 · RM79 / 月' },
  { id: 'product_exp_l', kind: 'product_expansion', tier: 'L', slots: 30,  priceRm: 129, recurring: 'monthly', label: '产品扩容包 L · +30 个产品位 · RM129 / 月' },
  // AI FAQ Generation Credits — one-time, 12-month validity
  { id: 'faq_credit_s',  kind: 'faq_credits',       tier: 'S', credits: 10,  priceRm: 19,  recurring: 'one_time', validMonths: 12, label: 'AI FAQ 生成包 S · 10 次 · RM19' },
  { id: 'faq_credit_m',  kind: 'faq_credits',       tier: 'M', credits: 30,  priceRm: 49,  recurring: 'one_time', validMonths: 12, label: 'AI FAQ 生成包 M · 30 次 · RM49' },
  { id: 'faq_credit_l',  kind: 'faq_credits',       tier: 'L', credits: 100, priceRm: 129, recurring: 'one_time', validMonths: 12, label: 'AI FAQ 生成包 L · 100 次 · RM129' },
  // AI Reply Credits — one-time, 12-month validity
  { id: 'ai_reply_s',    kind: 'ai_reply_credits',  tier: 'S', credits: 1000,  priceRm: 29,  recurring: 'one_time', validMonths: 12, label: 'AI 回复包 S · 1,000 条 · RM29' },
  { id: 'ai_reply_m',    kind: 'ai_reply_credits',  tier: 'M', credits: 5000,  priceRm: 99,  recurring: 'one_time', validMonths: 12, label: 'AI 回复包 M · 5,000 条 · RM99' },
  { id: 'ai_reply_l',    kind: 'ai_reply_credits',  tier: 'L', credits: 20000, priceRm: 299, recurring: 'one_time', validMonths: 12, label: 'AI 回复包 L · 20,000 条 · RM299' },
]

export const RECOMMENDED_ADD_ONS: Record<PlanId, string[]> = {
  starter:  ['product_exp_s', 'faq_credit_m', 'ai_reply_m'],
  pro:      ['product_exp_m', 'faq_credit_m', 'ai_reply_m'],
  business: ['product_exp_l', 'faq_credit_l', 'ai_reply_l'],
  trial:    [],
}

export function getPlan(planId: string): PlanDef {
  return PLANS[planId as PlanId] ?? PLANS.trial
}
export function getAddOn(id: string): AddOnDef | undefined {
  return ADD_ONS.find(a => a.id === id)
}
