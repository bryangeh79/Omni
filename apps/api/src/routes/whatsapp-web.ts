// WhatsApp Web connection management routes.
// Registered at /channels/whatsapp-web/* (see channel.ts).
//
// All routes are DEV-ONLY until auth middleware is added in Phase 3.
// tenantId is accepted from request body/params for Phase 2B testing.

import type { FastifyInstance } from 'fastify'
import path from 'path'

import { WhatsAppWebAdapter }            from '@omni/channel-adapters'
import { prisma, PrismaChannelType }     from '@omni/db'

import {
  getAdapter,
  setAdapter,
  removeAdapter,
} from '../adapter-registry'
import { routeInboundMessage } from '../message-router'

export async function whatsappWebRoutes(app: FastifyInstance) {

  // POST /channels/whatsapp-web/connect
  // Body: { tenantId, displayName? }
  // Creates or reconnects a WhatsApp Web channel.
  app.post('/connect', async (req, reply) => {
    const { tenantId, displayName } = (req.body ?? {}) as Record<string, string>

    if (!tenantId) {
      return reply.status(400).send({ error: 'tenantId is required' })
    }

    // Ensure tenant exists
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
    if (!tenant) {
      return reply.status(404).send({ error: 'Tenant not found' })
    }

    // Create channel record in DB (upsert on slug-like match)
    const channel = await prisma.channel.create({
      data: {
        tenantId,
        type:        PrismaChannelType.WHATSAPP_WEB,
        displayName: displayName ?? 'WhatsApp Web',
        isActive:    false, // becomes true when CONNECTED
      },
    })

    // Instantiate adapter
    const adapter = new WhatsAppWebAdapter()

    // Wire inbound messages to the router
    adapter.onMessage(async (envelope) => {
      await routeInboundMessage(envelope, tenantId)
    })

    // Wire status updates to DB
    adapter.on('status', async (status: string) => {
      await prisma.channel.update({
        where: { id: channel.id },
        data:  { isActive: status === 'CONNECTED' },
      }).catch(() => { /* channel may have been deleted */ })
    })

    setAdapter(channel.id, adapter)

    // Start connection (stub or real, controlled by OMNI_ALLOW_WA_SESSION)
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
  })

  // GET /channels/whatsapp-web/:channelId/status
  app.get('/:channelId/status', async (req, reply) => {
    const { channelId } = req.params as { channelId: string }

    const channel = await prisma.channel.findUnique({ where: { id: channelId } })
    if (!channel) return reply.status(404).send({ error: 'Channel not found' })

    const adapter  = getAdapter(channelId)
    const adapterStatus = adapter?.getStatus() ?? 'DISCONNECTED'

    return {
      channelId,
      dbStatus:      channel.isActive ? 'ACTIVE' : 'INACTIVE',
      adapterStatus,
      qrAvailable:   adapterStatus === 'QR_PENDING' && adapter?.getQr() !== null,
      stubMode:      process.env.OMNI_ALLOW_WA_SESSION !== 'true',
    }
  })

  // GET /channels/whatsapp-web/:channelId/qr
  // Returns the current QR string for polling. QR is opaque — do NOT log it.
  app.get('/:channelId/qr', async (req, reply) => {
    const { channelId } = req.params as { channelId: string }

    const adapter = getAdapter(channelId)
    if (!adapter) {
      return reply.status(404).send({ error: 'Channel adapter not found — call /connect first' })
    }

    const qr = adapter.getQr()
    if (!qr) {
      return reply.status(204).send() // No QR available yet
    }

    // Return QR as opaque string — client renders it; server never logs/exposes content
    return { qr, expiresNote: 'QR expires in ~30s; re-poll if expired' }
  })

  // POST /channels/whatsapp-web/:channelId/disconnect
  app.post('/:channelId/disconnect', async (req, _reply) => {
    const { channelId } = req.params as { channelId: string }

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
  })
}
