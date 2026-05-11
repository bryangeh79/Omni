// In-memory adapter registry.
// Maps channelId → WhatsAppWebAdapter instance.
// State is per-process and resets on API restart.

import type { WhatsAppWebAdapter } from '@omni/channel-adapters'

const registry = new Map<string, WhatsAppWebAdapter>()

export function getAdapter(channelId: string): WhatsAppWebAdapter | undefined {
  return registry.get(channelId)
}

export function setAdapter(channelId: string, adapter: WhatsAppWebAdapter): void {
  registry.set(channelId, adapter)
}

export function removeAdapter(channelId: string): void {
  registry.delete(channelId)
}

export function listAdapters(): { channelId: string; status: string }[] {
  return Array.from(registry.entries()).map(([id, a]) => ({
    channelId: id,
    status:    a.getStatus(),
  }))
}
