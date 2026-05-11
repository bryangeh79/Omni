// AI Agent Orchestrator — skeleton
// Full LLM integration in Phase 3.

import type { InboundEnvelope } from '@omni/channel-adapters'

export interface AgentContext {
  tenantId:       string
  customerId:     string
  conversationId: string
  customerScore:  number
  history:        AgentMessage[]
}

export interface AgentMessage {
  role:    'customer' | 'ai' | 'human'
  content: string
}

export interface AgentResult {
  reply:            string
  shouldHandoff:    boolean
  scoreAdjustment:  number   // positive = add, negative = subtract
  detectedLanguage: string   // zh | en | ms
  detectedIntent:   string
}

export class AiAgentOrchestrator {
  async process(
    _envelope: InboundEnvelope,
    _context: AgentContext,
  ): Promise<AgentResult> {
    // Phase 3:
    // 1. Look up KB / FAQ
    // 2. Build system prompt (persona + goals + KB snippets)
    // 3. Call LLM
    // 4. Parse structured reply
    // 5. Evaluate handoff rules
    // 6. Update lead score
    throw new Error('AiAgentOrchestrator.process() not implemented (Phase 3)')
  }
}
