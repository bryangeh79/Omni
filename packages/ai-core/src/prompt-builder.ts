// Prompt / context builder utilities.
// Used by the orchestrator to assemble the full agent input before calling a provider.

import type {
  TenantAiConfig, CustomerProfile, MessageHistory, KnowledgeSnippet, AiAgentInput,
} from '@omni/shared'

export interface BuildSystemPromptOptions {
  config:         TenantAiConfig
  tenantName?:    string
  customerName?:  string
  customerStage?: string
  customerScore?: number
}

export function buildSystemPrompt(opts: BuildSystemPromptOptions): string {
  const { config, tenantName, customerName, customerStage, customerScore } = opts
  const parts: string[] = []

  // Persona
  if (config.persona) {
    parts.push(`You are: ${config.persona}`)
  } else if (tenantName) {
    parts.push(`You are an AI customer service assistant for ${tenantName}.`)
  } else {
    parts.push('You are a professional AI customer service assistant.')
  }

  // Goals
  if (config.goals.length > 0) {
    parts.push(`\nYour primary goals: ${config.goals.join(', ')}.`)
  }

  // Custom system prompt
  if (config.systemPrompt) {
    parts.push(`\nAdditional instructions: ${config.systemPrompt}`)
  }

  // Customer context
  if (customerName || customerStage || customerScore !== undefined) {
    const ctx: string[] = []
    if (customerName)                ctx.push(`Name: ${customerName}`)
    if (customerStage)               ctx.push(`Stage: ${customerStage}`)
    if (customerScore !== undefined) ctx.push(`Score: ${customerScore}/100`)
    parts.push(`\nCurrent customer context: ${ctx.join(', ')}.`)
  }

  // Language policy
  if (config.replyLanguagePolicy && config.replyLanguagePolicy !== 'AUTO') {
    parts.push(`\nAlways reply in: ${config.replyLanguagePolicy}`)
  }

  // Safety rules
  parts.push('\nRules: Be accurate. If you do not know, say so. Do NOT make up prices or facts. Do NOT hallucinate.')

  return parts.join('\n')
}

export function buildConversationContext(history: MessageHistory[]): string {
  if (history.length === 0) return '(no prior conversation)'
  return history
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n')
}

export function buildKnowledgeContext(snippets: KnowledgeSnippet[]): string {
  if (snippets.length === 0) return '(no relevant knowledge base entries found)'
  return snippets
    .map((s, i) => s.question
      ? `[KB ${i + 1}] Q: ${s.question}\nA: ${s.answer}`
      : `[KB ${i + 1}] ${s.answer}`,
    )
    .join('\n\n')
}

/**
 * Assemble a complete AiAgentInput from already-loaded context.
 * The caller is responsible for loading all data from DB before calling this.
 */
export function buildAiAgentInput(params: {
  tenantId:            string
  conversationId:      string
  customerId:          string
  messageId:           string
  messageBody:         string
  aiConfig:            TenantAiConfig
  customerProfile:     CustomerProfile
  conversationHistory: MessageHistory[]
  knowledgeContext:    KnowledgeSnippet[]
}): AiAgentInput {
  return {
    tenantId:            params.tenantId,
    conversationId:      params.conversationId,
    customerId:          params.customerId,
    messageId:           params.messageId,
    messageBody:         params.messageBody,
    aiConfig:            params.aiConfig,
    customerProfile:     params.customerProfile,
    conversationHistory: params.conversationHistory,
    knowledgeContext:    params.knowledgeContext,
  }
}
