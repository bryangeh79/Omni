// WhatsApp Web Channel Adapter — skeleton
// Quick-start channel: Tenant scans QR → session stored → messages enter AI Agent / CRM.
// This is NOT the official Meta API. Stability boundaries apply.
// Real implementation (Baileys / whatsapp-web.js) in Phase 2.

import type {
  BaseChannelAdapter,
  ChannelConfig,
  ChannelStatus,
  MessageHandler,
  OutboundEnvelope,
} from '../base'

export class WhatsAppWebAdapter implements BaseChannelAdapter {
  readonly channelType = 'WHATSAPP_WEB' as const
  private status: ChannelStatus = 'DISCONNECTED'
  private handler?: MessageHandler

  async connect(_config: ChannelConfig): Promise<void> {
    // Phase 2: initialize Baileys, load/create session, emit QR code event
    this.status = 'CONNECTING'
    throw new Error('WhatsAppWebAdapter.connect() not implemented (Phase 2)')
  }

  async disconnect(): Promise<void> {
    // Phase 2: close Baileys socket, clean up session
    this.status = 'DISCONNECTED'
  }

  async sendMessage(_envelope: OutboundEnvelope): Promise<void> {
    // Phase 2: send via Baileys socket
    throw new Error('WhatsAppWebAdapter.sendMessage() not implemented (Phase 2)')
  }

  onMessage(handler: MessageHandler): void {
    this.handler = handler
  }

  getStatus(): ChannelStatus {
    return this.status
  }
}
