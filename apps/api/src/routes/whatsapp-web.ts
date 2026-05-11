// WhatsApp Web connection management routes.
// Registered at /channels/whatsapp-web/* (see channel.ts).
//
// All routes are auth-protected (Phase 3+).
// tenantId comes from req.user.tenantId — never from request body.

import type { FastifyInstance } from 'fastify'
import path from 'path'

import { WhatsAppWebAdapter }        from '@omni/channel-adapters'
import { prisma, PrismaChannelType } from '@omni/db'

import { getAdapter, setAdapter, removeAdapter } from '../adapter-registry'
import { routeInboundMessage }                   from '../message-router'
import { requireAuth, getAuthUser }              from '../auth'

export async function whatsappWebRoutes(app: FastifyInstance) {

  // POST /channels/whatsapp-web/connect
  // Body: { displayName? }   ← tenantId from req.user.tenantId only
  app.post<{ Body: { displayName?: string } }>(
    '/connect',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { tenantId } = getAuthUser(req)
      const { displayName } = (req.body ?? {}) as { displayName?: string }

      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
      if (!tenant || !tenant.isActive) {
        return reply.status(404).send({ error: 'Tenant not found or inactive' })
      }

      const channel = await prisma.channel.create({
        data: {
          tenantId,
          type:        PrismaChannelType.WHATSAPP_WEB,
          displayName: displayName ?? 'WhatsApp Web',
          isActive:    false,
        },
      })

      const adapter = new WhatsAppWebAdapter()

      adapter.onMessage(async (envelope) => {
        await routeInboundMessage(envelope, tenantId)
      })

      adapter.on('status', async (status: string) => {
        await prisma.channel.update({
          where: { id: channel.id },
          data:  { isActive: status === 'CONNECTED' },
        }).catch(() => { /* channel may have been deleted */ })
      })

      setAdapter(channel.id, adapter)

      await adapter.connect({
        channelId:   channel.id,
        tenantId,
        projectRoot: path.resolve(__dirname, '../../../../'),
      })

      return reply.status(201).send({
        channelId: channel.id,
        status:    adapter.getStatus(),
        qrPending: adapter.getStatus() === 'QR_PENDING',
        stubMode:  process.env.OMNI_ALLOW_WA_SESSION !== 'true',
        message:   'Channel created. Poll GET /channels/whatsapp-web/:channelId/qr for QR.',
      })
    },
  )

  // GET /channels/whatsapp-web/:channelId/status
  app.get<{ Params: { channelId: string } }>(
    '/:channelId/status',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { channelId } = req.params
      const { tenantId }  = getAuthUser(req)

      const channel = await prisma.channel.findFirst({
        where: { id: channelId, tenantId }, // tenant-scoped lookup
      })
      if (!channel) return reply.status(404).send({ error: 'Channel not found' })

      const adapter = getAdapter(channelId)
      return {
        channelId,
        dbActive:      channel.isActive,
        adapterStatus: adapter?.getStatus() ?? 'DISCONNECTED',
        qrAvailable:   adapter?.getStatus() === 'QR_PENDING' && adapter.getQr() !== null,
        stubMode:      process.env.OMNI_ALLOW_WA_SESSION !== 'true',
      }
    },
  )

  // GET /channels/whatsapp-web/:channelId/qr
  // Returns QR string as opaque value — never log it
  app.get<{ Params: { channelId: string } }>(
    '/:channelId/qr',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { channelId } = req.params
      const { tenantId }  = getAuthUser(req)

      const channel = await prisma.channel.findFirst({
        where: { id: channelId, tenantId },
      })
      if (!channel) return reply.status(404).send({ error: 'Channel not found' })

      const adapter = getAdapter(channelId)
      if (!adapter) {
        return reply.status(404).send({ error: 'Adapter not running — call /connect first' })
      }

      const qr = adapter.getQr()
      if (!qr) return reply.status(204).send()

      return { qr, note: 'Render as QR image on client — do not log this value' }
    },
  )

  // POST /channels/whatsapp-web/:channelId/disconnect
  app.post<{ Params: { channelId: string } }>(
    '/:channelId/disconnect',
    { preHandler: requireAuth },
    async (req, _reply) => {
      const { channelId } = req.params
      const { tenantId }  = getAuthUser(req)

      // Verify channel belongs to tenant
      const channel = await prisma.channel.findFirst({
        where: { id: channelId, tenantId },
      })
      if (!channel) return { error: 'Channel not found', channelId }

      const adapter = getAdapter(channelId)
      if (adapter) {
        await adapter.disconnect()
        removeAdapter(channelId)
      }

      await prisma.channel.update({
        where: { id: channelId },
        data:  { isActive: false },
      }).catch(() => { /* channel may not exist */ })

      return { channelId, status: 'DISCONNECTED' }
    },
  )
}
