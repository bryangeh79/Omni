// AiProviderFactory — creates the right provider based on tenant config.
// Phase 5C: OpenAI real call implemented. Gemini/DeepSeek: Phase 5D.

import type { AiProviderClient } from './provider-interface'
import { GeminiProvider, DeepSeekProvider }    from './provider-interface'
import { DryRunProvider }                       from './dry-run-provider'
import type { AiAgentInput, AiAgentResult, TenantAiConfig } from '@omni/shared'
import { callOpenAi }                           from './openai-provider'

// ── KEY_NOT_CONFIGURED provider ────────────────────────────────────────────────

class KeyNotConfiguredProvider implements AiProviderClient {
  constructor(readonly provider: string, readonly model: string) {}

  async complete(_input: AiAgentInput): Promise<AiAgentResult> {
    return {
      reply:                `[KEY_NOT_CONFIGURED] Provider ${this.provider}/${this.model} requires an API key. Configure it in AI Agent Settings.`,
      shouldHandoff:        true,
      scoreAdjustment:      0,
      suggestedTags:        ['needs_human'],
      nextAction:           'HANDOFF',
      detectedLanguage:     'en',
      provider:             this.provider,
      model:                this.model,
      inputTokensEstimate:  0,
      outputTokensEstimate: 0,
    }
  }
}

// ── OpenAI provider (real call in Phase 5C) ────────────────────────────────────

class OpenAiProvider implements AiProviderClient {
  readonly provider = 'OPENAI' as const

  constructor(
    readonly model:          string,
    private readonly apiKey: string,
  ) {}

  async complete(input: AiAgentInput): Promise<AiAgentResult> {
    return callOpenAi(this.apiKey, this.model, input)
  }
}

// ── Factory ────────────────────────────────────────────────────────────────────

export interface ProviderOptions {
  hasKey?: boolean
  apiKey?: string   // decrypted key — MUST NOT be logged or returned
}

export class AiProviderFactory {
  static create(
    config: Pick<TenantAiConfig, 'aiProvider' | 'model'>,
    options: ProviderOptions = {},
  ): AiProviderClient {
    const realProviders = ['OPENAI', 'GEMINI', 'DEEPSEEK']

    if (realProviders.includes(config.aiProvider)) {
      if (!options.hasKey || !options.apiKey) {
        return new KeyNotConfiguredProvider(config.aiProvider, config.model)
      }
      switch (config.aiProvider) {
        case 'OPENAI':   return new OpenAiProvider(config.model, options.apiKey)
        case 'GEMINI':   return new GeminiProvider(config.model)   // stub — Phase 5D
        case 'DEEPSEEK': return new DeepSeekProvider(config.model) // stub — Phase 5D
      }
    }

    return new DryRunProvider()
  }
}
