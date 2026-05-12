// Re-exports vault utilities from @omni/shared so the API keeps its existing import paths.
// The actual implementation has moved to packages/shared/src/api-key-vault.ts
// so that apps/worker can also import it.

export {
  isVaultConfigured,
  encryptApiKey,
  decryptApiKey,
  extractLast4,
  validateKeyShape,
  KEY_PROVIDERS,
} from '@omni/shared'
export type { KeyProvider } from '@omni/shared'
