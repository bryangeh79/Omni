// AiAgentOrchestrator — main entry point for AI processing.
// Phase 5A/5B: DryRunProvider or KeyNotConfiguredProvider.
// Real provider calls (Phase 5C) require a configured API key.

import type { AiAgentInput, AiAgentResult } from '@omni/shared'
import { AiProviderFactory } from './factory'

export class AiAgentOrchestrator {
  /**
   * Process an inbound message and return an AI result.
   *
   * @param input   Full agent input (built by context-builder)
   * @param hasKey  Whether the tenant has a decryptable API key stored
   *
   * Does NOT write to DB, does NOT send WhatsApp — callers handle those.
   */
  async process(input: AiAgentInput, hasKey = false): Promise<AiAgentResult> {
    const provider = AiProviderFactory.create(
      { aiProvider: input.aiConfig.aiProvider, model: input.aiConfig.model },
      hasKey,
    )
    return provider.complete(input)
  }
}

export const aiOrchestrator = new AiAgentOrchestrator()
