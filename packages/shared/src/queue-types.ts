// Shared queue/job type definitions for API (enqueue) and Worker (consume).

export const QUEUE_NAMES = {
  INBOUND_MESSAGES: 'omni-inbound-messages',
} as const

export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES]

export const JOB_NAMES = {
  PROCESS_INBOUND_MESSAGE: 'PROCESS_INBOUND_MESSAGE',
} as const

/** Payload for an inbound message processing job. */
export interface InboundMessageJobData {
  tenantId:       string
  channelId:      string
  conversationId: string
  customerId:     string
  messageId:      string
  createdAt:      string  // ISO 8601
}

/** Placeholder for future follow-up evaluation job. */
export interface FollowUpEvaluationJobData {
  tenantId:       string
  conversationId: string
  ruleId:         string
  scheduledAt:    string
}
