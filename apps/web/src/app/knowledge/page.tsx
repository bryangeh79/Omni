'use client'

import { useEffect, useState, useRef } from 'react'
import {
  getToken, login,
  fetchKnowledgeItems, createKnowledgeItem, updateKnowledgeItem, deleteKnowledgeItem,
  type KnowledgeItem,
} from '@/lib/api'

// ── Constants ─────────────────────────────────────────────────────────────────
const TYPES = ['GLOBAL_FAQ', 'PRODUCT_FAQ', 'KNOWLEDGE_CHUNK'] as const
type KbType = typeof TYPES[number]

const LANGUAGES = [
  { value: 'en', label: '英文' },
  { value: 'zh', label: '中文' },
  { value: 'ms', label: '马来文' },
]

const TYPE_CFG: Record<KbType, { label: string; badge: string; dot: string }> = {
  GLOBAL_FAQ:      { label: '通用 FAQ',  badge: 'bg-blue-50 text-blue-700 border-blue-200',           dot: 'bg-blue-500' },
  PRODUCT_FAQ:     { label: '产品 FAQ',  badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  KNOWLEDGE_CHUNK: { label: '知识片段',   badge: 'bg-purple-50 text-purple-700 border-purple-200',    dot: 'bg-purple-500' },
}

// ── Auth ──────────────────────────────────────────────────────────────────────
function LoginForm({ onLogin }: { onLogin: () => void }) {
  const [slug, setSlug] = useState('')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true)
    try { await login(slug, email, pass); onLogin() }
    catch (ex) { setErr(ex instanceof Error ? ex.message : '登录失败') }
    finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-indigo-100">
      <form onSubmit={submit} className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-sm space-y-4">
        <div className="text-center mb-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-purple-600 mb-3">
            <span className="text-white text-2xl font-bold">KB</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">知识库</h1>
          <p className="text-sm text-gray-400 mt-1">登录以管理您的 AI 知识库</p>
        </div>
        {err && <p className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-2">{err}</p>}
        <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-purple-400" placeholder="租户标识" value={slug} onChange={e => setSlug(e.target.value)} required />
        <input type="email" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-purple-400" placeholder="邮箱" value={email} onChange={e => setEmail(e.target.value)} required />
        <input type="password" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-purple-400" placeholder="密码" value={pass} onChange={e => setPass(e.target.value)} required />
        <button type="submit" disabled={busy} className="w-full bg-purple-600 hover:bg-purple-700 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">{busy ? '登录中…' : '登录'}</button>
      </form>
    </div>
  )
}

// ── Create Item Form ──────────────────────────────────────────────────────────
function CreateForm({ onCreate, onCancel }: { onCreate: (item: KnowledgeItem) => void; onCancel: () => void }) {
  const [type,     setType]     = useState<KbType>('PRODUCT_FAQ')
  const [question, setQuestion] = useState('')
  const [answer,   setAnswer]   = useState('')
  const [language, setLanguage] = useState('en')
  const [busy,     setBusy]     = useState(false)
  const [err,      setErr]      = useState('')
  const ansRef = useRef<HTMLTextAreaElement>(null)

  const needsQuestion = type !== 'KNOWLEDGE_CHUNK'

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true)
    try {
      const item = await createKnowledgeItem({
        type, answer,
        question: needsQuestion ? question : (question || undefined),
        language,
      })
      onCreate(item)
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : '创建失败')
    } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-2xl border border-purple-200 p-5 space-y-4 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-gray-800">新增知识条目</h3>
        <button type="button" onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-600">✕ 取消</button>
      </div>
      {err && <p className="bg-red-50 text-red-600 text-xs rounded-lg px-3 py-2">{err}</p>}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-1">类型 *</label>
          <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-purple-400" value={type} onChange={e => setType(e.target.value as KbType)}>
            {TYPES.map(t => <option key={t} value={t}>{TYPE_CFG[t].label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-1">语言</label>
          <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-purple-400" value={language} onChange={e => setLanguage(e.target.value)}>
            {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-600 block mb-1">问题 {needsQuestion ? '*' : '（选填）'}</label>
        <input
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-400"
          placeholder={needsQuestion ? '例如：你们的营业时间是？' : '选填的问题…'}
          value={question}
          onChange={e => setQuestion(e.target.value)}
          required={needsQuestion}
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-600 block mb-1">答案 *</label>
        <textarea
          ref={ansRef}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-400 resize-none"
          rows={3}
          placeholder="AI 在回复客户时会使用这段答案…"
          value={answer}
          onChange={e => setAnswer(e.target.value)}
          required
        />
      </div>
      <button type="submit" disabled={busy} className="w-full bg-purple-600 hover:bg-purple-700 text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50">
        {busy ? '保存中…' : '加入知识库'}
      </button>
    </form>
  )
}

// ── Edit Inline Form ──────────────────────────────────────────────────────────
function EditForm({
  item, onSave, onCancel,
}: { item: KnowledgeItem; onSave: (updated: KnowledgeItem) => void; onCancel: () => void }) {
  const [type,     setType]     = useState<KbType>(item.type as KbType)
  const [question, setQuestion] = useState(item.question ?? '')
  const [answer,   setAnswer]   = useState(item.answer)
  const [language, setLanguage] = useState(item.language)
  const [busy,     setBusy]     = useState(false)
  const [err,      setErr]      = useState('')

  const needsQuestion = type !== 'KNOWLEDGE_CHUNK'

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true)
    try {
      const updated = await updateKnowledgeItem(item.id, {
        type, answer,
        question: needsQuestion ? (question || null) : (question || null),
        language,
      })
      onSave(updated)
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : '保存失败')
    } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="mt-3 pt-3 border-t border-gray-100 space-y-3">
      {err && <p className="bg-red-50 text-red-600 text-xs rounded-lg px-3 py-2">{err}</p>}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-1">类型</label>
          <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs bg-white outline-none focus:ring-2 focus:ring-purple-400" value={type} onChange={e => setType(e.target.value as KbType)}>
            {TYPES.map(t => <option key={t} value={t}>{TYPE_CFG[t].label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-1">语言</label>
          <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs bg-white outline-none focus:ring-2 focus:ring-purple-400" value={language} onChange={e => setLanguage(e.target.value)}>
            {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-600 block mb-1">问题 {needsQuestion ? '*' : '（选填）'}</label>
        <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-purple-400" value={question} onChange={e => setQuestion(e.target.value)} />
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-600 block mb-1">答案 *</label>
        <textarea className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-purple-400 resize-none" rows={3} value={answer} onChange={e => setAnswer(e.target.value)} required />
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white rounded-xl py-2 text-xs font-semibold disabled:opacity-50">{busy ? '保存中…' : '保存修改'}</button>
        <button type="button" onClick={onCancel} className="px-4 bg-gray-100 text-gray-600 rounded-xl py-2 text-xs hover:bg-gray-200">取消</button>
      </div>
    </form>
  )
}

// ── Knowledge Item Row ────────────────────────────────────────────────────────
function KbRow({
  item, onUpdate, onRemove,
}: { item: KnowledgeItem; onUpdate: (updated: KnowledgeItem) => void; onRemove: (id: string) => void }) {
  const [editing,    setEditing]    = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy,       setBusy]       = useState(false)

  const typeCfg = TYPE_CFG[item.type as KbType] ?? { label: item.type, badge: 'bg-gray-100 text-gray-600 border-gray-200', dot: 'bg-gray-400' }
  const langLabel = LANGUAGES.find(l => l.value === item.language)?.label ?? item.language

  async function handleToggleActive() {
    setBusy(true)
    try {
      const updated = await updateKnowledgeItem(item.id, { isActive: !item.isActive })
      onUpdate(updated)
    } finally { setBusy(false) }
  }

  async function handleDelete() {
    if (!confirming) { setConfirming(true); return }
    setBusy(true)
    try {
      await deleteKnowledgeItem(item.id)
      onRemove(item.id)
    } catch { setBusy(false); setConfirming(false) }
  }

  return (
    <div className={`bg-white rounded-2xl border p-4 transition-all ${item.isActive ? 'border-gray-100' : 'border-gray-100 opacity-60'}`}>
      <div className="flex items-start gap-3">
        {/* Type indicator */}
        <div className={`w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0 ${typeCfg.dot}`} />
        <div className="flex-1 min-w-0">
          {/* Badges row */}
          <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${typeCfg.badge}`}>{typeCfg.label}</span>
            <span className="text-xs text-gray-400 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-full">{langLabel}</span>
            {!item.isActive && <span className="text-xs text-orange-500 bg-orange-50 border border-orange-100 px-2 py-0.5 rounded-full">已停用</span>}
          </div>
          {/* Question */}
          {item.question && (
            <p className="text-sm font-semibold text-gray-800 leading-snug mb-1">{item.question}</p>
          )}
          {/* Answer */}
          {!editing && (
            <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">{item.answer}</p>
          )}
          {/* Inline edit form */}
          {editing && (
            <EditForm
              item={item}
              onSave={updated => { onUpdate(updated); setEditing(false) }}
              onCancel={() => setEditing(false)}
            />
          )}
          {/* Footer */}
          {!editing && (
            <p className="text-xs text-gray-400 mt-1.5">
              添加于 {new Date(item.createdAt).toLocaleDateString('zh-CN')}
            </p>
          )}
        </div>
        {/* Actions */}
        {!editing && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={() => setEditing(true)}
              className="text-xs px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100 transition-all"
            >
              编辑
            </button>
            <button
              onClick={() => { void handleToggleActive() }}
              disabled={busy}
              title={item.isActive ? '停用' : '启用'}
              className={`text-xs px-2.5 py-1 rounded-lg border transition-all disabled:opacity-50 ${item.isActive ? 'bg-orange-50 border-orange-200 text-orange-600 hover:bg-orange-100' : 'bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100'}`}
            >
              {item.isActive ? '停用' : '启用'}
            </button>
            <button
              onClick={() => { void handleDelete() }}
              disabled={busy}
              className={`text-xs px-2.5 py-1 rounded-lg border transition-all disabled:opacity-50 ${confirming ? 'bg-red-100 border-red-300 text-red-700 hover:bg-red-200' : 'bg-gray-50 border-gray-200 text-gray-400 hover:bg-gray-100'}`}
            >
              {busy ? '…' : confirming ? '确认删除？' : '删除'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Knowledge Page ───────────────────────────────────────────────────────
export default function KnowledgePage() {
  const [authed,      setAuthed]      = useState<boolean | null>(null)
  const [items,       setItems]       = useState<KnowledgeItem[]>([])
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [typeFilter,  setTypeFilter]  = useState('all')
  const [showInactive,setShowInactive]= useState(false)
  const [searchQ,     setSearchQ]     = useState('')
  const [total,       setTotal]       = useState(0)
  const [showCreate,  setShowCreate]  = useState(false)

  useEffect(() => {
    if (getToken()) { setAuthed(true); void load() }
  }, [])

  async function load(params?: { type?: string; q?: string; isActive?: boolean }) {
    setLoading(true); setError('')
    try {
      const res = await fetchKnowledgeItems({
        type:     params?.type,
        q:        params?.q,
        isActive: params?.isActive,
        page:     1,
      })
      setItems(res.data)
      setTotal(res.pagination.total)
    } catch (e) { setError(e instanceof Error ? e.message : '加载失败') }
    finally { setLoading(false) }
  }

  function applyFilters() {
    void load({
      type:     typeFilter !== 'all' ? typeFilter : undefined,
      q:        searchQ.trim() || undefined,
      isActive: showInactive ? undefined : true,
    })
  }

  function handleTypeFilter(f: string) {
    setTypeFilter(f)
    void load({ type: f !== 'all' ? f : undefined, q: searchQ.trim() || undefined, isActive: showInactive ? undefined : true })
  }

  function handleCreate(item: KnowledgeItem) {
    setItems(prev => [item, ...prev])
    setTotal(prev => prev + 1)
    setShowCreate(false)
  }

  function handleUpdate(updated: KnowledgeItem) {
    setItems(prev => prev.map(i => i.id === updated.id ? updated : i))
  }

  function handleRemove(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
    setTotal(prev => Math.max(0, prev - 1))
  }

  if (authed === null) return null

  if (!authed) return <LoginForm onLogin={() => { setAuthed(true); void load() }} />

  const activeCount = items.filter(i => i.isActive).length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-purple-600 rounded-xl flex items-center justify-center">
              <span className="text-white text-sm font-bold">KB</span>
            </div>
            <div>
              <h1 className="text-base font-semibold text-gray-900">知识库</h1>
              <p className="text-xs text-gray-400">
                {loading ? '加载中…' : `共 ${total} 条 · 启用 ${activeCount} 条`}
              </p>
            </div>
          </div>
          <nav className="flex items-center gap-3 text-xs">
            <a href="/onboarding" className="text-purple-600 hover:text-purple-800 font-medium">+ 从上线向导导入</a>
            <span className="text-gray-200">|</span>
            <a href="/channels/setup" className="text-blue-600 hover:text-blue-700">渠道设置</a>
            <span className="text-gray-200">|</span>
            <a href="/boss" className="text-gray-500 hover:text-gray-700">工作台</a>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6 space-y-4">
        {error && <div className="bg-red-50 border border-red-200 text-red-600 rounded-2xl px-5 py-3 text-sm">{error}</div>}

        {/* Toolbar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2">
          {/* Search */}
          <div className="flex-1 relative">
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-purple-400"
              placeholder="搜索问题与答案…"
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') applyFilters() }}
            />
          </div>
          {/* Type filter chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {(['all', ...TYPES] as const).map(f => (
              <button
                key={f}
                onClick={() => handleTypeFilter(f)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full transition-all ${typeFilter === f ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-purple-300'}`}
              >
                {f === 'all' ? '全部' : TYPE_CFG[f]?.label ?? f}
              </button>
            ))}
          </div>
          {/* Show inactive toggle */}
          <button
            onClick={() => { setShowInactive(v => { const next = !v; void load({ type: typeFilter !== 'all' ? typeFilter : undefined, q: searchQ.trim() || undefined, isActive: next ? undefined : true }); return next }) }}
            className={`text-xs px-3 py-1.5 rounded-full border transition-all ${showInactive ? 'bg-orange-50 border-orange-200 text-orange-600' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}
          >
            {showInactive ? '显示全部' : '仅启用'}
          </button>
          {/* Add button */}
          <button
            onClick={() => setShowCreate(v => !v)}
            className="flex-shrink-0 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all"
          >
            {showCreate ? '✕ 取消' : '+ 新增条目'}
          </button>
        </div>

        {/* Create form */}
        {showCreate && (
          <CreateForm
            onCreate={handleCreate}
            onCancel={() => setShowCreate(false)}
          />
        )}

        {/* Items list */}
        {loading && items.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-sm">正在加载知识库…</p>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-base font-semibold text-gray-700 mb-2">暂无知识条目</p>
            <p className="text-sm text-gray-400 max-w-sm mx-auto mb-6">
              请先完成上线向导并解析您的产品 / 服务资料，或使用上方按钮手动添加。
            </p>
            <div className="flex gap-3 justify-center">
              <a href="/onboarding" className="bg-purple-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-purple-700">完成上线向导 →</a>
              <button onClick={() => setShowCreate(true)} className="bg-gray-100 text-gray-700 text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-gray-200">手动添加</button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map(item => (
              <KbRow
                key={item.id}
                item={item}
                onUpdate={handleUpdate}
                onRemove={handleRemove}
              />
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 text-xs text-blue-600">
          知识库按租户隔离，条目不会跨租户共享。AI 客服在回复客户时会使用所有「已启用」的条目。
        </div>
      </main>
    </div>
  )
}
