// AI context builder for API endpoints (dry-run preview).
// Mirrors apps/worker/src/context-builder.ts but used by the API.
// For actual job processing, the worker has its own version.

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

async function loadCustomerProfile(customerId: string, tenantId: string): Promise<CustomerProfile> {
  if (customerId === 'dry-run-preview') {
    return { id: 'dry-run-preview', phone: '', stage: 'NEW', score: 0, tags: [] }
  }
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

async function loadConversationHistory(conversationId: string): Promise<MessageHistory[]> {
  if (conversationId === 'dry-run-preview') return []
  const messages = await prisma.message.findMany({
    where:   { conversationId },
    orderBy: { createdAt: 'desc' },
    take:    10,
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

async function loadKnowledgeContext(
  tenantId: string,
  messageBody: string,
): Promise<KnowledgeSnippet[]> {
  const q = messageBody.trim().slice(0, 200)
  if (!q) return []

  const qMatches = await prisma.knowledgeItem.findMany({
    where:   { tenantId, isActive: true, question: { contains: q, mode: 'insensitive' as const } },
    orderBy: { updatedAt: 'desc' },
    take:    3,
  })

  const qIds = new Set(qMatches.map((m) => m.id))
  const aMatches = qMatches.length < 3
    ? await prisma.knowledgeItem.findMany({
        where:   { tenantId, isActive: true, id: { notIn: [...qIds] }, answer: { contains: q, mode: 'insensitive' as const } },
        orderBy: { updatedAt: 'desc' },
        take:    3 - qMatches.length,
      })
    : []

  return [...qMatches, ...aMatches].map((k) => ({
    question: k.question, answer: k.answer, language: k.language, type: k.type,
  }))
}

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
  return buildAiAgentInput({ ...params, aiConfig, customerProfile, conversationHistory, knowledgeContext })
}
