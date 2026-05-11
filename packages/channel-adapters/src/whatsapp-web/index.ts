/* eslint-disable @typescript-eslint/no-explicit-any */
// WhatsApp Web Channel Adapter (Baileys-based)
//
// CHANNEL TYPE:  Ordinary WhatsApp / WhatsApp Business App via WhatsApp Web login.
// NOT the official Meta WhatsApp Business API.
//
// SAFETY GUARD:
//   Real Baileys connection is gated behind env var OMNI_ALLOW_WA_SESSION=true.
//   Without it, the adapter runs in STUB mode:
//     - connect() → status CONNECTING (no real socket)
//     - sendMessage() → logs but does not send
//     - QR → emits a synthetic stub QR string
//   Set OMNI_ALLOW_WA_SESSION=true only on a machine approved for WhatsApp testing.
//
// SESSION PATH:
//   data/wa-sessions/{channelId}/ — never outside this boundary.

import { EventEmitter } from 'events'

import { resolveSessionDir } from './session'
import type {
  ChannelConfig,
  ChannelStatus,
  InboundEnvelope,
  MessageHandler,
  OutboundEnvelope,
  QrCapableAdapter,
  QrHandler,
} from '../base'

export class WhatsAppWebAdapter extends EventEmitter implements QrCapableAdapter {
  readonly channelType = 'WHATSAPP_WEB' as const

  private _status: ChannelStatus = 'DISCONNECTED'
  private messageHandler?: MessageHandler
  private qrHandler?: QrHandler
  private latestQr: string | null = null
  private channelId = ''
  private tenantId  = ''
  private sessionDir = ''
  private projectRoot = ''
  private socket: any = null
  private _baileys: any = null

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async connect(config: ChannelConfig): Promise<void> {
    this.channelId   = config.channelId
    this.tenantId    = config.tenantId
    this.projectRoot = (config.projectRoot as string | undefined) ?? process.cwd()
    this.sessionDir  = resolveSessionDir(this.channelId, this.projectRoot)

    if (process.env.OMNI_ALLOW_WA_SESSION !== 'true') {
      this._setStatus('CONNECTING')
      console.log(
        `[wa-web:${this.channelId}] STUB MODE — no real WhatsApp connection.` +
        ` Set OMNI_ALLOW_WA_SESSION=true to enable.`,
      )
      // Emit a clearly-marked stub QR so callers can test the QR flow
      setTimeout(() => {
        const stubQr = `STUB_QR::${this.channelId}::not-a-real-qr-code`
        this.latestQr = stubQr
        this.qrHandler?.(stubQr)
        this.emit('qr', stubQr)
        this._setStatus('QR_PENDING')
      }, 200)
      return
    }

    // ── Real Baileys connection ──────────────────────────────────────────────
    await this._connectBaileys()
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      try {
        await this.socket.logout?.()
      } catch { /* ignore logout errors */ }
      this.socket.end?.()
      this.socket = null
    }
    this.latestQr = null
    this._setStatus('DISCONNECTED')
  }

  async sendMessage(envelope: OutboundEnvelope): Promise<void> {
    if (process.env.OMNI_ALLOW_WA_SESSION !== 'true' || !this.socket) {
      console.log(
        `[wa-web:${this.channelId}] STUB sendMessage → ${envelope.to}: ${envelope.body}`,
      )
      return
    }
    if (this._status !== 'CONNECTED') {
      throw new Error(`Cannot send — adapter status: ${this._status}`)
    }
    const jid = envelope.to.replace(/^\+/, '') + '@s.whatsapp.net'
    await this.socket.sendMessage(jid, { text: envelope.body })
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler
  }

  onQr(handler: QrHandler): void {
    this.qrHandler = handler
    if (this.latestQr) handler(this.latestQr) // replay if QR already ready
  }

  getQr(): string | null {
    return this.latestQr
  }

  getStatus(): ChannelStatus {
    return this._status
  }

  // ── Internal: Baileys ──────────────────────────────────────────────────────

  private async _getBaileys(): Promise<any> {
    if (this._baileys) return this._baileys
    // Dynamic import: handles both CJS and ESM Baileys builds
    this._baileys = await import('@whiskeysockets/baileys')
    return this._baileys
  }

  private async _connectBaileys(): Promise<void> {
    try {
      const baileys = await this._getBaileys()
      const makeWASocket = baileys.default ?? baileys.makeWASocket

      const { state, saveCreds } =
        await baileys.useMultiFileAuthState(this.sessionDir)

      let version: [number, number, number] = [2, 3000, 0]
      try {
        const v = await baileys.fetchLatestBaileysVersion()
        version = v.version
      } catch { /* use fallback version */ }

      this.socket = makeWASocket({
        version,
        auth:              state,
        printQRInTerminal: false, // QR handled via event, never printed to stdout
        logger:            { level: 'silent', child: () => ({ level: 'silent' }) } as any,
      })

      this.socket.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect, qr } = update ?? {}

        if (qr) {
          this.latestQr = qr
          // QR is Baileys internal data — handler must not log or expose it
          this.qrHandler?.(qr)
          this.emit('qr', qr)
          this._setStatus('QR_PENDING')
        }

        if (connection === 'open') {
          this.latestQr = null
          this._setStatus('CONNECTED')
        }

        if (connection === 'close') {
          const code = lastDisconnect?.error?.output?.statusCode
          this.socket = null
          this._setStatus(code === 401 ? 'ERROR' : 'DISCONNECTED')
        }
      })

      this.socket.ev.on('creds.update', saveCreds)

      this.socket.ev.on('messages.upsert', async ({ messages, type }: any) => {
        if (type !== 'notify') return
        for (const msg of messages ?? []) {
          if (msg?.key?.fromMe) continue
          const envelope = this._normalizeMessage(msg)
          if (envelope && this.messageHandler) {
            await this.messageHandler(envelope).catch((err) =>
              console.error(`[wa-web:${this.channelId}] message handler error:`, err),
            )
          }
        }
      })

      this._setStatus('CONNECTING')
    } catch (err) {
      this.socket = null
      this._setStatus('ERROR')
      this.emit('error', err)
      throw err
    }
  }

  private _normalizeMessage(msg: any): InboundEnvelope | null {
    try {
      const jid  = msg?.key?.remoteJid ?? ''
      const from = jid.replace('@s.whatsapp.net', '').replace('@g.us', '')
      const body =
        msg?.message?.conversation ??
        msg?.message?.extendedTextMessage?.text ??
        msg?.message?.buttonsResponseMessage?.selectedDisplayText ??
        ''

      if (!from || !body) return null

      return {
        channelType: 'WHATSAPP_WEB',
        channelId:   this.channelId,
        externalId:  msg?.key?.id ?? '',
        from:        from.startsWith('+') ? from : `+${from}`,
        body,
        receivedAt:  msg?.messageTimestamp
          ? new Date(Number(msg.messageTimestamp) * 1000)
          : new Date(),
        // raw is stored for internal debug; never exposed in logs or API responses
        raw: msg,
      }
    } catch {
      return null
    }
  }

  private _setStatus(status: ChannelStatus): void {
    this._status = status
    this.emit('status', status)
  }
}
