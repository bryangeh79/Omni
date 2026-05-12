// Meta WhatsApp Business Platform API Adapter (Phase 7A).
// Real sends disabled by default. Set OMNI_ENABLE_REAL_META_SEND=true to enable.
//
// SAFETY RULES:
//   - Raw access token MUST NOT be logged
//   - Real send only when OMNI_ENABLE_REAL_META_SEND=true
//   - sendMessage() returns without throwing in stub mode (caller checks sendStatus)
//   - handleWebhook() parsing done in webhook-meta.ts route instead

import type {
  BaseChannelAdapter,
  ChannelConfig,
  ChannelStatus,
  MessageHandler,
  OutboundEnvelope,
} from '../base'

const GRAPH_API_BASE = 'https://graph.facebook.com/v19.0'
const TIMEOUT_MS     = 30_000

export interface MetaChannelConfig extends ChannelConfig {
  phoneNumberId: string
  accessToken?:  string  // decrypted in-memory only — never log or return
}

export class MetaApiAdapter implements BaseChannelAdapter {
  readonly channelType = 'META_API' as const

  private status:        ChannelStatus = 'DISCONNECTED'
  private handler?:      MessageHandler
  private phoneNumberId  = ''
  private accessToken?:  string  // in-memory only; cleared on disconnect

  async connect(config: ChannelConfig): Promise<void> {
    const metaConfig = config as MetaChannelConfig
    this.phoneNumberId = metaConfig.phoneNumberId ?? ''
    this.accessToken   = metaConfig.accessToken
    this.status        = 'CONNECTED'
  }

  async disconnect(): Promise<void> {
    this.accessToken = undefined  // clear from memory
    this.status      = 'DISCONNECTED'
  }

  /**
   * Send a text message via Meta Messages API.
   * Default mode: OMNI_ENABLE_REAL_META_SEND is NOT set → logs and returns (no real send).
   * Real mode:    OMNI_ENABLE_REAL_META_SEND=true AND access token configured → calls API.
   * Never logs raw access token.
   */
  async sendMessage(envelope: OutboundEnvelope): Promise<void> {
    if (process.env.OMNI_ENABLE_REAL_META_SEND !== 'true') {
      console.log(`[meta-adapter] Stub mode (OMNI_ENABLE_REAL_META_SEND not set). to=${envelope.to}`)
      return
    }

    if (!this.accessToken || !this.phoneNumberId) {
      throw new Error('[meta-adapter] Cannot send: phoneNumberId or access token not configured')
    }

    const url        = `${GRAPH_API_BASE}/${this.phoneNumberId}/messages`
    const controller = new AbortController()
    const timer      = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const response = await fetch(url, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${this.accessToken}`,  // raw token used here only, never logged
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type:    'individual',
          to:                envelope.to,
          type:              'text',
          text:              { preview_url: false, body: envelope.body },
        }),
        signal: controller.signal,
      })
      clearTimeout(timer)

      if (!response.ok) {
        let errText = `HTTP ${response.status}`
        try { errText = (await response.text()).slice(0, 200) } catch { /* ignore */ }
        throw new Error(`[meta-adapter] API error ${response.status}: ${errText}`)
      }
    } catch (err) {
      clearTimeout(timer)
      const msg = (err as Error).message
      if (msg.includes('AbortError') || (err as Error).name === 'AbortError') {
        throw new Error('[meta-adapter] Send timeout (>30s)')
      }
      throw err
    }
  }

  onMessage(handler: MessageHandler): void {
    this.handler = handler
  }

  // Direct webhook parsing is handled in apps/api/src/routes/webhook-meta.ts
  async handleWebhook(_payload: unknown): Promise<void> {
    void _payload
  }

  getStatus(): ChannelStatus {
    return this.status
  }
}
