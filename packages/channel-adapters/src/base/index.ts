// BaseChannelAdapter — interface and shared envelope types
// All channel adapters must implement this interface.

export type ChannelType =
  | 'WHATSAPP_WEB'
  | 'META_API'
  | 'FACEBOOK_MESSENGER'
  | 'INSTAGRAM'
  | 'WECHAT'
  | 'ZALO'
  | 'LINE'
  | 'TIKTOK'

export type ChannelStatus =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'QR_PENDING'    // waiting for QR scan
  | 'ERROR'

export interface InboundEnvelope {
  channelType:  ChannelType
  channelId:    string      // internal channel record id
  externalId:   string      // channel-native message id
  from:         string      // customer phone / user id (E.164 format)
  body:         string
  mediaUrl?:    string
  receivedAt:   Date
  raw?:         unknown     // original channel payload (debug only — never log/expose)
}

export interface OutboundEnvelope {
  channelType:  ChannelType
  channelId:    string
  to:           string
  body:         string
  mediaUrl?:    string
}

export type MessageHandler = (envelope: InboundEnvelope) => Promise<void>

export interface ChannelConfig {
  channelId:    string
  tenantId:     string
  [key: string]: unknown
}

export interface BaseChannelAdapter {
  readonly channelType: ChannelType

  connect(config: ChannelConfig): Promise<void>
  disconnect(): Promise<void>
  sendMessage(envelope: OutboundEnvelope): Promise<void>
  onMessage(handler: MessageHandler): void
  getStatus(): ChannelStatus
}

// QR-capable adapters (WhatsApp Web, etc.)
export type QrHandler = (qr: string) => void

export interface QrCapableAdapter extends BaseChannelAdapter {
  onQr(handler: QrHandler): void
  getQr(): string | null
}
