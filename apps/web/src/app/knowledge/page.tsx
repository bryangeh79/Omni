'use client'

import { useEffect, useState } from 'react'
import {
  getToken, login, fetchKnowledgeItems, deleteKnowledgeItem,
  type KnowledgeItem,
} from '@/lib/api'

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  GLOBAL_FAQ:      { label: 'Global FAQ',    color: 'bg-blue-50 text-blue-700' },
  PRODUCT_FAQ:     { label: 'Product FAQ',   color: 'bg-emerald-50 text-emerald-700' },
  KNOWLEDGE_CHUNK: { label: 'Knowledge',     color: 'bg-purple-50 text-purple-700' },
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
    catch (ex) { setErr(ex instanceof Error ? ex.message : 'Login failed') }
    finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-indigo-100">
      <form onSubmit={submit} className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-sm space-y-4">
        <div className="text-center mb-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-purple-600 mb-3">
            <span className="text-white text-2xl">🧠</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Knowledge Base</h1>
          <p className="text-sm text-gray-400 mt-1">Sign in to view your AI knowledge</p>
        </div>
        {err && <p className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-2">{err}</p>}
        <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-purple-400" placeholder="Tenant slug" value={slug} onChange={e => setSlug(e.target.value)} required />
        <input type="email" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-purple-400" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
        <input type="password" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-purple-400" placeholder="Password" value={pass} onChange={e => setPass(e.target.value)} required />
        <button type="submit" disabled={busy} className="w-full bg-purple-600 hover:bg-purple-700 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">{busy ? 'Signing in…' : 'Sign In'}</button>
      </form>
    </div>
  )
}

// ── Knowledge Item Card ───────────────────────────────────────────────────────
function KbCard({ item, onDelete }: { item: KnowledgeItem; onDelete: (id: string) => void }) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const typeInfo = TYPE_LABELS[item.type] ?? { label: item.type, color: 'bg-gray-100 text-gray-600' }

  async function handleDelete() {
    if (!confirming) { setConfirming(true); return }
    setDeleting(true)
    try { await deleteKnowledgeItem(item.id); onDelete(item.id) }
    catch { setDeleting(false); setConfirming(false) }
  }

  return (
    <div className={`bg-white rounded-2xl border border-gray-100 p-4 space-y-2 ${!item.isActive ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${typeInfo.color}`}>{typeInfo.label}</span>
            {!item.isActive && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Inactive</span>}
          </div>
          {item.question && (
            <p className="text-sm font-semibold text-gray-800 leading-snug mb-1 truncate">{item.question}</p>
          )}
          <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">{item.answer}</p>
        </div>
        <button
          onClick={() => { void handleDelete() }}
          disabled={deleting}
          className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-xl font-medium transition-all disabled:opacity-50 ${confirming ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
        >
          {deleting ? '…' : confirming ? 'Confirm?' : 'Delete'}
        </button>
      </div>
      <p className="text-xs text-gray-400">Added {new Date(item.createdAt).toLocaleDateString()}</p>
    </div>
  )
}

// ── Main Knowledge Page ───────────────────────────────────────────────────────
export default function KnowledgePage() {
  const [authed,  setAuthed]  = useState(false)
  const [items,   setItems]   = useState<KnowledgeItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [filter,  setFilter]  = useState<string>('all')
  const [total,   setTotal]   = useState(0)

  useEffect(() => {
    if (getToken()) { setAuthed(true); void load() }
  }, [])

  async function load(type?: string) {
    setLoading(true); setError('')
    try {
      const params = type && type !== 'all' ? { type } : undefined
      const res = await fetchKnowledgeItems(params)
      setItems(res.data)
      setTotal(res.pagination.total)
    } catch (e) { setError(e instanceof Error ? e.message : 'Load failed') }
    finally { setLoading(false) }
  }

  function handleFilterChange(f: string) {
    setFilter(f)
    void load(f)
  }

  function handleDelete(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
    setTotal(prev => Math.max(0, prev - 1))
  }

  if (!authed) return <LoginForm onLogin={() => { setAuthed(true); void load() }} />

  const filtered = filter === 'all' ? items : items.filter(i => i.type === filter)
  const activeCount = items.filter(i => i.isActive).length

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-purple-600 rounded-xl flex items-center justify-center">
              <span className="text-white text-lg">🧠</span>
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900">Knowledge Base</h1>
              <p className="text-xs text-gray-400">{total} total · {activeCount} active items</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href="/onboarding" className="text-xs text-purple-600 hover:text-purple-800 font-medium">+ Add from Wizard</a>
            <span className="text-gray-200">|</span>
            <a href="/boss" className="text-xs text-gray-400 hover:text-gray-600">← Dashboard</a>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6 space-y-4">
        {error && <div className="bg-red-50 border border-red-200 text-red-600 rounded-2xl px-5 py-3 text-sm">{error}</div>}

        {/* Filter bar */}
        <div className="flex items-center gap-2 flex-wrap">
          {['all', 'GLOBAL_FAQ', 'PRODUCT_FAQ', 'KNOWLEDGE_CHUNK'].map(f => (
            <button
              key={f}
              onClick={() => handleFilterChange(f)}
              className={`text-xs font-medium px-3 py-1.5 rounded-full transition-all ${filter === f ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-purple-300'}`}
            >
              {f === 'all' ? 'All Types' : TYPE_LABELS[f]?.label ?? f}
            </button>
          ))}
          <button
            onClick={() => { void load(filter === 'all' ? undefined : filter) }}
            disabled={loading}
            className="ml-auto text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5 rounded-full border border-gray-200 bg-white disabled:opacity-50"
          >
            {loading ? 'Loading…' : '↻ Refresh'}
          </button>
        </div>

        {/* Items */}
        {loading && items.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">⏳</p>
            <p className="text-sm">Loading knowledge base…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">🧠</p>
            <p className="text-sm font-medium text-gray-500 mb-1">No knowledge items yet</p>
            <p className="text-xs">Go through the onboarding wizard and ingest your materials to populate this knowledge base.</p>
            <a href="/onboarding" className="inline-block mt-4 bg-purple-600 text-white text-xs font-bold px-5 py-2.5 rounded-xl hover:bg-purple-700">Start Onboarding →</a>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(item => (
              <KbCard key={item.id} item={item} onDelete={handleDelete} />
            ))}
          </div>
        )}

        {/* Safety footer */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 text-xs text-blue-600">
          Items sourced from onboarding materials ingestion. AI knowledge base is tenant-scoped and not shared across tenants.
        </div>
      </main>
    </div>
  )
}
