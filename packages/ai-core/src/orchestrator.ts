// AiAgentOrchestrator — main entry point for AI processing.
// Phase 5C: real OpenAI calls supported via ProviderOptions.

import type { AiAgentInput, AiAgentResult } from '@omni/shared'
import { AiProviderFactory, type ProviderOptions } from './factory'

export class AiAgentOrchestrator {
  /**
   * Process an inbound message and return an AI result.
   *
   * @param input    Full agent input (built by context-builder)
   * @param options  hasKey + apiKey (decrypted, MUST NOT be logged or returned)
   *
   * Does NOT write to DB, does NOT send WhatsApp — callers handle those.
   */
  async process(input: AiAgentInput, options: ProviderOptions = {}): Promise<AiAgentResult> {
    const provider = AiProviderFactory.create(
      { aiProvider: input.aiConfig.aiProvider, model: input.aiConfig.model },
      options,
    )
    return provider.complete(input)
  }
}

export const aiOrchestrator = new AiAgentOrchestrator()
