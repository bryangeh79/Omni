// AiProviderFactory — returns the right provider based on tenant config.
// Phase 5B: provider stubs. Real calls: Phase 5C (requires API key + SDK).

import type { AiProviderClient } from './provider-interface'
import { OpenAiProvider, GeminiProvider, DeepSeekProvider } from './provider-interface'
import { DryRunProvider } from './dry-run-provider'
import type { AiAgentInput, AiAgentResult, TenantAiConfig } from '@omni/shared'

// ── KEY_NOT_CONFIGURED provider ───────────────────────────────────────────────

/** Returned when a real provider is selected but no API key is configured. */
class KeyNotConfiguredProvider implements AiProviderClient {
  constructor(
    readonly provider: string,
    readonly model:    string,
  ) {}

  async complete(_input: AiAgentInput): Promise<AiAgentResult> {
    return {
      reply: `[KEY_NOT_CONFIGURED] Provider ${this.provider}/${this.model} requires an API key. Configure it in AI Agent Settings.`,
      shouldHandoff:        true,    // always hand off if AI cannot process
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

// ── Factory ───────────────────────────────────────────────────────────────────

export class AiProviderFactory {
  /**
   * Create the appropriate AI provider client.
   *
   * @param config  Provider + model selection from tenant AI config
   * @param hasKey  Whether a tenant API key is configured in the vault
   *
   * Rules:
   * - DRY_RUN / PLATFORM_DEFAULT → always DryRunProvider
   * - Real provider (OPENAI/GEMINI/DEEPSEEK) + hasKey=false → KeyNotConfiguredProvider
   * - Real provider + hasKey=true → provider stub (real call: Phase 5C)
   */
  static create(
    config: Pick<TenantAiConfig, 'aiProvider' | 'model'>,
    hasKey = false,
  ): AiProviderClient {
    const realProviders = ['OPENAI', 'GEMINI', 'DEEPSEEK']

    if (realProviders.includes(config.aiProvider)) {
      if (!hasKey) {
        // Key not configured → safe fallback, always handoff
        return new KeyNotConfiguredProvider(config.aiProvider, config.model)
      }
      // Key configured but real SDK call not implemented yet (Phase 5C)
      switch (config.aiProvider) {
        case 'OPENAI':   return new OpenAiProvider(config.model)
        case 'GEMINI':   return new GeminiProvider(config.model)
        case 'DEEPSEEK': return new DeepSeekProvider(config.model)
      }
    }

    // DRY_RUN, PLATFORM_DEFAULT, unknown → DryRunProvider
    return new DryRunProvider()
  }
}
