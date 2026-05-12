// Shared keyword heuristics and language detection for all AI providers.
// Used by openai-provider, gemini-provider, deepseek-provider.

const HANDOFF_SIGNAL = ['human', 'agent', '人工', '客服', 'refund', 'complaint', '退款', '投诉']
const PRICE_SIGNAL   = ['price', 'pricing', 'package', '价格', '套餐', 'harga']
const DEMO_SIGNAL    = ['demo', 'appointment', 'schedule', '预约']
const BUY_SIGNAL     = ['buy', 'purchase', 'payment', '购买', '支付', 'beli', 'bayar']

export function keywordShouldHandoff(text: string): boolean {
  const t = text.toLowerCase()
  return HANDOFF_SIGNAL.some((k) => t.includes(k))
}

export function keywordScoreAdj(body: string): number {
  const t = body.toLowerCase()
  if (HANDOFF_SIGNAL.some((k) => t.includes(k))) return 0
  let adj = 0
  if (PRICE_SIGNAL.some((k) => t.includes(k)))  adj += 20
  if (DEMO_SIGNAL.some((k)  => t.includes(k)))  adj += 25
  if (BUY_SIGNAL.some((k)   => t.includes(k)))  adj += 30
  return adj
}

export function detectLang(text: string): string {
  if (/[一-鿿]/.test(text)) return 'zh'
  if (/\b(saya|awak|anda|boleh|ini|itu|tak)\b/.test(text.toLowerCase())) return 'ms'
  return 'en'
}
