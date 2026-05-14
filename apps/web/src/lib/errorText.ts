// errorText.ts — Post-v1 UAT Round-3
// 将常见 API / 网络错误信息映射为对用户友好的中文文案。
// 仅作 UI 文案映射，不改 API 响应或字段名。

/**
 * 将后端 / 网络错误转换为中文用户文案。
 * - 接受 Error / string / unknown
 * - 已是中文（含 CJK 字符）的消息原样返回
 * - 未识别的英文消息回退为通用「操作失败，请稍后再试」
 */
export function toChineseError(err: unknown, fallback = '操作失败，请稍后再试'): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  if (!raw) return fallback

  // 已含中文，认为已经翻译过 — 直接返回
  if (/[一-鿿]/.test(raw)) return raw

  const lower = raw.toLowerCase()

  // 网络层
  if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('network request failed')) {
    return '无法连接到服务器，请确认 API 是否正在运行'
  }
  if (lower.includes('timeout')) {
    return '请求超时，请稍后再试'
  }
  if (lower.includes('aborted')) {
    return '请求已取消'
  }

  // HTTP 状态
  if (/(^|\W)401(\W|$)/.test(raw) || lower.includes('unauthorized') || lower.includes('invalid token') || lower.includes('jwt')) {
    return '登录已失效，请重新登录'
  }
  if (/(^|\W)403(\W|$)/.test(raw) || lower.includes('forbidden') || lower.includes('not allowed')) {
    return '当前账户没有权限执行此操作'
  }
  if (/(^|\W)404(\W|$)/.test(raw) || lower.includes('not found')) {
    return '资源不存在或已被删除'
  }
  if (/(^|\W)409(\W|$)/.test(raw) || lower.includes('conflict') || lower.includes('already exists') || lower.includes('duplicate')) {
    return '租户标识、邮箱或资源已存在，请更换后再试'
  }
  if (/(^|\W)422(\W|$)/.test(raw) || lower.includes('validation') || lower.includes('required') || lower.includes('invalid')) {
    return '请检查必填资料是否完整或格式是否正确'
  }
  if (/(^|\W)429(\W|$)/.test(raw) || lower.includes('rate limit') || lower.includes('too many')) {
    return '请求过于频繁，请稍后再试'
  }
  if (/(^|\W)5\d\d(\W|$)/.test(raw) || lower.includes('internal server error')) {
    return '服务器异常，请稍后再试'
  }

  // 业务规则
  if (lower.includes('real send') && (lower.includes('disabled') || lower.includes('blocked'))) {
    return '真实发送当前关闭，请先完成上线激活检查'
  }
  if (lower.includes('broadcast') || lower.includes('bulk send') || lower.includes('mass')) {
    return '系统已拦截群发风险 — Omni 不支持广播或群发'
  }
  if (lower.includes('wa session') && lower.includes('not allowed')) {
    return 'WhatsApp 会话当前未启用，请联系运维'
  }
  if (lower.includes('meta send') && (lower.includes('not enabled') || lower.includes('disabled'))) {
    return 'Meta 发送当前未启用，请联系运维'
  }
  if (lower.includes('login failed') || lower.includes('invalid credentials') || lower.includes('wrong password')) {
    return '登录失败，请检查租户标识、邮箱与密码'
  }

  return fallback
}

/** 简短动词级别的本地化（按钮 / 状态短语）。 */
export function toChineseAction(action: 'save' | 'load' | 'send' | 'delete' | 'update' | 'create' | 'fetch'): string {
  return ({
    save:   '保存失败',
    load:   '加载失败',
    send:   '发送失败',
    delete: '删除失败',
    update: '更新失败',
    create: '创建失败',
    fetch:  '请求失败',
  } as const)[action]
}
