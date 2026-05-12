// AI provider client interface.
// All providers implement this. Real providers call external APIs (Phase 5B+).
// DryRunProvider returns deterministic safe output with no external calls.

import type { AiAgentInput, AiAgentResult } from '@omni/shared'

export interface AiProviderClient {
  readonly provider: string
  readonly model:    string

  /**
   * Generate an AI reply for the given agent input.
   * Implementations must NOT send WhatsApp messages directly.
   * They return a result; the caller decides what to do with it.
   */
  complete(input: AiAgentInput): Promise<AiAgentResult>
}

/** Stub base that all real (non-dry-run) providers extend. */
export abstract class BaseRealProvider implements AiProviderClient {
  abstract readonly provider: string
  abstract readonly model:    string

  async complete(_input: AiAgentInput): Promise<AiAgentResult> {
    // Real implementation: Phase 5B+ (requires configured API key)
    throw new Error(
      `${this.provider} provider not yet configured. Set API key and enable in tenant settings.`,
    )
  }
}

// ── Provider stubs for structure validation ────────────────────────────────

export class OpenAiProvider extends BaseRealProvider {
  constructor(
    readonly model: string,
    private readonly _apiKey?: string,
  ) {
    super()
  }
  readonly provider = 'OPENAI' as const
  // Phase 5B: override complete() with real OpenAI SDK call
}

export class GeminiProvider extends BaseRealProvider {
  constructor(
    readonly model: string,
    private readonly _apiKey?: string,
  ) {
    super()
  }
  readonly provider = 'GEMINI' as const
  // Phase 5B: override complete() with real Gemini SDK call
}

export class DeepSeekProvider extends BaseRealProvider {
  constructor(
    readonly model: string,
    private readonly _apiKey?: string,
  ) {
    super()
  }
  readonly provider = 'DEEPSEEK' as const
  // Phase 5B: override complete() with real DeepSeek API call
}
