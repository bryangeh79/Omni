// AiProviderFactory — returns the right provider based on tenant config.
// Real providers (OpenAI, Gemini, DeepSeek) are stubs until Phase 5B.

import type { AiProviderClient } from './provider-interface'
import { OpenAiProvider, GeminiProvider, DeepSeekProvider } from './provider-interface'
import { DryRunProvider } from './dry-run-provider'
import type { TenantAiConfig } from '@omni/shared'

export class AiProviderFactory {
  static create(config: Pick<TenantAiConfig, 'aiProvider' | 'model'>): AiProviderClient {
    switch (config.aiProvider) {
      case 'OPENAI':           return new OpenAiProvider(config.model)
      case 'GEMINI':           return new GeminiProvider(config.model)
      case 'DEEPSEEK':         return new DeepSeekProvider(config.model)
      case 'PLATFORM_DEFAULT': return new DryRunProvider()  // same as dry-run until platform LLM
      case 'DRY_RUN':
      default:                 return new DryRunProvider()
    }
  }
}
