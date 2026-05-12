// AiAgentOrchestrator — main entry point for AI processing.
// Selects the right provider via factory and calls complete().
// Phase 5A: DRY_RUN provider only. Real providers: Phase 5B.

import type { AiAgentInput, AiAgentResult } from '@omni/shared'
import { AiProviderFactory } from './factory'

export class AiAgentOrchestrator {
  /**
   * Process an inbound message and return an AI result.
   * Does NOT write to DB, does NOT send WhatsApp — callers handle those actions.
   */
  async process(input: AiAgentInput): Promise<AiAgentResult> {
    const provider = AiProviderFactory.create({
      aiProvider: input.aiConfig.aiProvider,
      model:      input.aiConfig.model,
    })

    return provider.complete(input)
  }
}

// Singleton for worker use
export const aiOrchestrator = new AiAgentOrchestrator()
