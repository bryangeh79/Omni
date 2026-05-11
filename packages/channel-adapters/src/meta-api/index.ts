// Meta WhatsApp Business Platform API Adapter — skeleton
// Enterprise / official channel. More stable than WhatsApp Web.
// Real implementation in Phase 5.

import type {
  BaseChannelAdapter,
  ChannelConfig,
  ChannelStatus,
  MessageHandler,
  OutboundEnvelope,
} from '../base'

export class MetaApiAdapter implements BaseChannelAdapter {
  readonly channelType = 'META_API' as const
  private status: ChannelStatus = 'DISCONNECTED'
  private handler?: MessageHandler

  async connect(_config: ChannelConfig): Promise<void> {
    // Phase 5: validate webhook, confirm phone number ID
    this.status = 'CONNECTED'
  }

  async disconnect(): Promise<void> {
    this.status = 'DISCONNECTED'
  }

  async sendMessage(_envelope: OutboundEnvelope): Promise<void> {
    // Phase 5: POST to graph.facebook.com/v18.0/{phone_number_id}/messages
    throw new Error('MetaApiAdapter.sendMessage() not implemented (Phase 5)')
  }

  onMessage(handler: MessageHandler): void {
    this.handler = handler
  }

  // Called by the inbound webhook handler in apps/api
  async handleWebhook(_payload: unknown): Promise<void> {
    // Phase 5: parse payload, normalize to InboundEnvelope, call this.handler
    throw new Error('MetaApiAdapter.handleWebhook() not implemented (Phase 5)')
  }

  getStatus(): ChannelStatus {
    return this.status
  }
}
