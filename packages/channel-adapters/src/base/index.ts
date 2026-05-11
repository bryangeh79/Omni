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

export type ChannelStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR'

export interface InboundEnvelope {
  channelType:     ChannelType
  channelId:       string      // internal channel record id
  externalId:      string      // channel-native message id
  from:            string      // customer phone / user id
  body:            string
  mediaUrl?:       string
  receivedAt:      Date
  raw?:            unknown     // original channel payload for debugging
}

export interface OutboundEnvelope {
  channelType:     ChannelType
  channelId:       string
  to:              string
  body:            string
  mediaUrl?:       string
}

export type MessageHandler = (envelope: InboundEnvelope) => Promise<void>

export interface ChannelConfig {
  channelId:       string
  [key: string]:   unknown     // channel-specific config
}

export interface BaseChannelAdapter {
  readonly channelType: ChannelType

  connect(config: ChannelConfig): Promise<void>
  disconnect(): Promise<void>
  sendMessage(envelope: OutboundEnvelope): Promise<void>
  onMessage(handler: MessageHandler): void
  getStatus(): ChannelStatus
}
