// Context builder — loads all DB data needed for AI processing.
// Called by job-processor before invoking AiAgentOrchestrator.

import { prisma } from '@omni/db'
import type {
  TenantAiConfig, CustomerProfile, MessageHistory,
  KnowledgeSnippet, AiAgentInput,
} from '@omni/shared'
import { buildAiAgentInput } from '@omni/ai-core'

const DEFAULT_AI_CONFIG: TenantAiConfig = {
  aiProvider:          'DRY_RUN',
  model:               'dry-run',
  persona:             null,
  goals:               [],
  systemPrompt:        null,
  replyLanguagePolicy: 'AUTO',
  temperature:         null,
  maxTokens:           null,
}

/** Load AI config for a tenant. Falls back to safe defaults if not found. */
async function loadTenantAiConfig(tenantId: string): Promise<TenantAiConfig> {
  const config = await prisma.aiConfig.findUnique({ where: { tenantId } })
  if (!config) return DEFAULT_AI_CONFIG
  return {
    aiProvider:          (config.aiProvider ?? 'DRY_RUN') as TenantAiConfig['aiProvider'],
    model:               config.model ?? 'dry-run',
    persona:             config.persona,
    goals:               config.goals ?? [],
    systemPrompt:        config.systemPrompt,
    replyLanguagePolicy: (config.replyLanguagePolicy ?? 'AUTO') as TenantAiConfig['replyLanguagePolicy'],
    temperature:         config.temperature,
    maxTokens:           config.maxTokens,
  }
}

/** Load customer profile with tags. */
async function loadCustomerProfile(customerId: string, tenantId: string): Promise<CustomerProfile> {
  const customer = await prisma.customer.findFirst({
    where:   { id: customerId, tenantId },
    include: { tags: { select: { tag: true } } },
  })
  return {
    id:                 customerId,
    name:               customer?.name,
    phone:              customer?.phone ?? '',
    languagePreference: customer?.languagePreference,
    stage:              customer?.stage ?? 'NEW',
    score:              customer?.score ?? 0,
    tags:               customer?.tags.map((t) => t.tag) ?? [],
  }
}

/** Load last N messages as conversation history. */
async function loadConversationHistory(
  conversationId: string,
  limit = 10,
): Promise<MessageHistory[]> {
  const messages = await prisma.message.findMany({
    where:   { conversationId },
    orderBy: { createdAt: 'desc' },
    take:    limit,
    select:  { direction: true, senderType: true, content: true },
  })

  return messages.reverse().map((m) => ({
    role:    m.senderType === 'CUSTOMER' ? 'customer'
           : m.senderType === 'AI'       ? 'ai'
           : m.senderType === 'SYSTEM'   ? 'system'
           : 'human',
    content: m.content,
  })) as MessageHistory[]
}

/** Simple keyword KB search (same as POST /knowledge/search logic). */
async function loadKnowledgeContext(
  tenantId: string,
  messageBody: string,
  limit = 3,
): Promise<KnowledgeSnippet[]> {
  const q = messageBody.trim().slice(0, 200)
  if (!q) return []

  const qMatches = await prisma.knowledgeItem.findMany({
    where: {
      tenantId,
      isActive: true,
      question: { contains: q, mode: 'insensitive' },
    },
    orderBy: { updatedAt: 'desc' },
    take:    limit,
  })

  const remaining = limit - qMatches.length
  const qMatchIds = new Set(qMatches.map((m) => m.id))
  const aMatches  = remaining > 0
    ? await prisma.knowledgeItem.findMany({
        where: {
          tenantId,
          isActive: true,
          id:     { notIn: [...qMatchIds] },
          answer: { contains: q, mode: 'insensitive' },
        },
        orderBy: { updatedAt: 'desc' },
        take:    remaining,
      })
    : []

  return [...qMatches, ...aMatches].map((k) => ({
    question: k.question,
    answer:   k.answer,
    language: k.language,
    type:     k.type,
  }))
}

/** Build a complete AiAgentInput for a job. */
export async function buildJobContext(params: {
  tenantId:       string
  conversationId: string
  customerId:     string
  messageId:      string
  messageBody:    string
}): Promise<AiAgentInput> {
  const [aiConfig, customerProfile, conversationHistory, knowledgeContext] = await Promise.all([
    loadTenantAiConfig(params.tenantId),
    loadCustomerProfile(params.customerId, params.tenantId),
    loadConversationHistory(params.conversationId),
    loadKnowledgeContext(params.tenantId, params.messageBody),
  ])

  return buildAiAgentInput({
    ...params,
    aiConfig,
    customerProfile,
    conversationHistory,
    knowledgeContext,
  })
}
