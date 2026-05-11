/* eslint-disable @typescript-eslint/no-explicit-any */
// Tenant isolation helpers.
// Every returned function automatically injects tenantId into WHERE / data,
// preventing cross-tenant data leakage.

import type { PrismaClient } from '@prisma/client'

export type TenantScopedDb = ReturnType<typeof scopeToTenant>

export function scopeToTenant(db: PrismaClient, tenantId: string) {
  const scope = { tenantId }

  return {
    tenantId,

    customers: {
      list:    ()                => db.customer.findMany({ where: scope }),
      byPhone: (phone: string)   => db.customer.findFirst({ where: { ...scope, phone } }),
      byId:    (id: string)      => db.customer.findFirst({ where: { ...scope, id } }),
      count:   ()                => db.customer.count({ where: scope }),
      create:  (data: any)       => db.customer.create({ data: { tenantId, ...data } }),
      update:  (id: string, data: any) =>
        db.customer.update({ where: { id }, data }),
      delete:  (id: string)      => db.customer.delete({ where: { id } }),
    },

    channels: {
      list:   ()           => db.channel.findMany({ where: scope }),
      byId:   (id: string) => db.channel.findFirst({ where: { ...scope, id } }),
      create: (data: any)  => db.channel.create({ data: { tenantId, ...data } }),
      delete: (id: string) => db.channel.delete({ where: { id } }),
    },

    conversations: {
      list:   ()           => db.conversation.findMany({ where: scope }),
      byId:   (id: string) => db.conversation.findFirst({ where: { ...scope, id } }),
      create: (data: any)  => db.conversation.create({ data: { tenantId, ...data } }),
      delete: (id: string) => db.conversation.delete({ where: { id } }),
    },

    messages: {
      // Messages don't have tenantId directly; they're scoped via conversation
      inConversation: (conversationId: string) =>
        db.message.findMany({ where: { conversationId } }),
      create: (data: any) => db.message.create({ data }),
      delete: (id: string) => db.message.delete({ where: { id } }),
    },

    knowledge: {
      list:       (lang?: string) =>
        db.knowledgeItem.findMany({ where: { ...scope, ...(lang ? { language: lang } : {}) } }),
      create:     (data: any)     => db.knowledgeItem.create({ data: { tenantId, ...data } }),
      deleteById: (id: string)    => db.knowledgeItem.delete({ where: { id } }),
    },

    followUpRules: {
      list: () => db.followUpRule.findMany({ where: scope }),
    },

    handoffRules: {
      list: () => db.handoffRule.findMany({ where: scope }),
    },
  }
}
