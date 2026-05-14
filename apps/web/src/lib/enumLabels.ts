// enumLabels.ts — Post-v1 UAT Round-4
// 集中前端 enum → 中文 label 映射，避免重复并保证术语一致。
// 仅用于 UI 显示，绝不修改 API 返回值；未知值安全回退。

function pick(map: Record<string, string>, value: unknown, fallback?: string): string {
  if (value === null || value === undefined) return fallback ?? '—'
  const key = String(value)
  return map[key] ?? fallback ?? key
}

/** 通用兜底：null/undefined 返回 fallback，其他值经映射或原样返回。 */
export function safeEnumLabel(value: unknown, map: Record<string, string>, fallback?: string): string {
  return pick(map, value, fallback)
}

// ── 客户阶段 (Customer.stage) ─────────────────────────────────────────────────
export const STAGE_LABELS: Record<string, string> = {
  NEW:         '新客户',
  INTERESTED:  '已确认需求',
  HIGH_INTENT: '高意向',
  QUOTED:      '已报价',
  BOOKED:      '已预约',
  WON:         '已成交',
  LOST:        '已流失',
  AFTER_SALES: '售后',
}
export function stageLabel(value: unknown): string {
  return pick(STAGE_LABELS, value)
}

// ── 对话状态 (Conversation.status) ───────────────────────────────────────────
export const CONVERSATION_STATUS_LABELS: Record<string, string> = {
  AI_HANDLING:     'AI 处理中',
  PENDING_HANDOFF: '待人工接管',
  HUMAN_HANDLING:  '人工处理中',
  CLOSED:          '已关闭',
}
export function conversationStatusLabel(value: unknown): string {
  return pick(CONVERSATION_STATUS_LABELS, value)
}

// ── 渠道类型 (Channel.type) ──────────────────────────────────────────────────
export const CHANNEL_TYPE_LABELS: Record<string, string> = {
  WA_WEB:           '普通 WhatsApp / WhatsApp Web',
  META_WA_BUSINESS: 'Meta WhatsApp Business 官方 API',
}
export function channelTypeLabel(value: unknown): string {
  return pick(CHANNEL_TYPE_LABELS, value)
}

// ── 渠道配置状态 (ChannelSetup.setupStatus) ───────────────────────────────────
export const CHANNEL_SETUP_STATUS_LABELS: Record<string, string> = {
  DRAFT:                 '草稿',
  TESTED_STUB:           '安全演练已通过',
  READY_FOR_CREDENTIALS: '待填写凭据',
  CREDENTIALS_SAVED:     '凭据已保存',
  ACTIVATION_PENDING:    '待激活',
  ACTIVE:                '已激活',
  FAILED:                '失败',
}
export function channelSetupStatusLabel(value: unknown): string {
  return pick(CHANNEL_SETUP_STATUS_LABELS, value)
}

// ── 凭据状态 (CredentialStatus) ──────────────────────────────────────────────
export const CREDENTIAL_STATUS_LABELS: Record<string, string> = {
  NONE:             '未设置',
  DRAFT:            '草稿（未加密）',
  ENCRYPTED_STORED: '已加密保存',
}
export function credentialStatusLabel(value: unknown): string {
  return pick(CREDENTIAL_STATUS_LABELS, value)
}

// ── 角色 (User.role) ─────────────────────────────────────────────────────────
export const ACTOR_ROLE_LABELS: Record<string, string> = {
  OWNER:   '所有者',
  ADMIN:   '管理员',
  MANAGER: '经理',
  AGENT:   '客服',
  VIEWER:  '只读',
}
export function actorRoleLabel(value: unknown): string {
  return pick(ACTOR_ROLE_LABELS, value)
}

// ── 消息发送方类型 (Message.senderType) ───────────────────────────────────────
export const MESSAGE_SENDER_LABELS: Record<string, string> = {
  AI:          'AI 客服',
  HUMAN_AGENT: '人工客服',
  CUSTOMER:    '客户',
  SYSTEM:      '系统',
}
export function messageSenderLabel(value: unknown): string {
  return pick(MESSAGE_SENDER_LABELS, value)
}

// ── 消息方向 (Message.direction) ─────────────────────────────────────────────
export const MESSAGE_DIRECTION_LABELS: Record<string, string> = {
  INBOUND:  '客户消息',
  OUTBOUND: '已发送',
}
export function messageDirectionLabel(value: unknown): string {
  return pick(MESSAGE_DIRECTION_LABELS, value)
}

// ── 自动跟进场景 (FollowUpTask.scenario) ──────────────────────────────────────
export const FOLLOW_UP_SCENARIO_LABELS: Record<string, string> = {
  NO_REPLY_24H:       '24 小时未回复',
  NO_REPLY_72H:       '72 小时未回复',
  QUOTE_SENT:         '已发送报价',
  HIGH_INTENT_NUDGE:  '高意向催进',
  APPOINTMENT_REMIND: '预约提醒',
  AFTER_SALES_CHECK:  '售后回访',
  CUSTOM:             '自定义',
}
export function followUpScenarioLabel(value: unknown): string {
  // 兼容 SCREAMING_SNAKE 与小写下划线
  const v = String(value ?? '').toUpperCase()
  return FOLLOW_UP_SCENARIO_LABELS[v] ?? String(value ?? '—').replace(/_/g, ' ')
}

// ── 跟进任务状态 (FollowUpTask.status) ────────────────────────────────────────
export const FOLLOW_UP_STATUS_LABELS: Record<string, string> = {
  PENDING:    '待处理',
  DUE:        '今日到期',
  OVERDUE:    '已逾期',
  COMPLETED:  '已完成',
  CANCELLED:  '已取消',
  SKIPPED:    '已跳过',
}
export function followUpStatusLabel(value: unknown): string {
  return pick(FOLLOW_UP_STATUS_LABELS, value)
}

// ── 激活状态 (Activation readiness / live status) ────────────────────────────
export const ACTIVATION_STATUS_LABELS: Record<string, string> = {
  // readiness
  BLOCKED:                       '已阻塞',
  READY_FOR_STAGING:             '可进入预演环境',
  READY_FOR_PRODUCTION_REVIEW:   '可进入生产复核',
  NOT_READY:                     '尚未就绪',
  // live / wa-web session
  NOT_STARTED:                   '尚未启动',
  WAITING_FOR_QR:                '等待扫码',
  CONNECTING:                    '正在连接',
  CONNECTED:                     '已连接',
  DISCONNECTED:                  '已断开',
  EXPIRED:                       '已过期',
  // meta live
  READY_FOR_LIVE_TEST:           '可进行真实测试',
  WEBHOOK_NOT_SUBSCRIBED:        'Webhook 未订阅',
  CREDENTIALS_MISSING:           '凭据缺失',
  // staging
  PARTIALLY_READY:               '部分就绪',
  READY_FOR_MANUAL_ACTIVATION_REVIEW: '可进入人工激活复核',
}
export function activationStatusLabel(value: unknown): string {
  return pick(ACTIVATION_STATUS_LABELS, value)
}

// ── 审计动作 (AuditLog.action) ───────────────────────────────────────────────
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  TEAM_INVITE_DRAFT:        '记录团队邀请草稿',
  TEAM_ROLE_UPDATE:         '修改成员角色',
  TEAM_STATUS_UPDATE:       '修改成员状态',
  BILLING_PLAN_SELECTED:    '选择计费套餐',
  SETTINGS_PROFILE_UPDATE:  '更新公司资料',
  SMOKE_TEST_EVENT:         '冒烟测试事件',
  ACTIVATION_DRY_RUN:       '激活安全演练',
  ACTIVATION_REQUEST:       '发起激活请求',
  ACTIVATION_CONFIRM:       '确认激活',
  CHANNEL_DRAFT_SAVE:       '保存渠道草稿',
  CREDENTIAL_DRAFT_SAVE:    '保存凭据草稿（加密）',
  CREDENTIAL_CLEAR:         '清除凭据',
}
export function auditActionLabel(value: unknown): string {
  return pick(AUDIT_ACTION_LABELS, value)
}

// ── 严重等级 (security event severity) ────────────────────────────────────────
export const SEVERITY_LABELS: Record<string, string> = {
  critical: '严重',
  warning:  '警告',
  info:     '信息',
}
export function severityLabel(value: unknown): string {
  return pick(SEVERITY_LABELS, value)
}

// ── 布尔值显示 ───────────────────────────────────────────────────────────────
export function booleanLabel(value: unknown, trueLabel = '是', falseLabel = '否'): string {
  if (value === null || value === undefined) return '—'
  return value ? trueLabel : falseLabel
}
