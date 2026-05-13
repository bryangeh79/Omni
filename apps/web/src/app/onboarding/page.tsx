'use client'

import { useEffect, useState } from 'react'
import {
  getToken, login, saveOnboardingDraft, generateOnboardingPreview, enableOnboarding,
  fetchOnboardingStatus,
  type OnboardingPreview,
} from '@/lib/api'

const INDUSTRIES = [
  { value: 'real-estate',    label: 'Real Estate' },
  { value: 'education',      label: 'Education & Training' },
  { value: 'retail',         label: 'Retail / E-commerce' },
  { value: 'food-beverage',  label: 'Food & Beverage' },
  { value: 'beauty-wellness',label: 'Beauty & Wellness' },
  { value: 'automotive',     label: 'Automotive' },
  { value: 'healthcare',     label: 'Healthcare & Clinic' },
  { value: 'finance',        label: 'Finance & Insurance' },
  { value: 'default',        label: 'Other / General' },
]

const AI_GOALS = [
  { value: 'lead-conversion',  label: 'Convert leads to customers',      emoji: '🎯' },
  { value: 'appointment',      label: 'Book appointments / meetings',     emoji: '📅' },
  { value: 'demo-trial',       label: 'Schedule demos / free trials',     emoji: '🔬' },
  { value: 'collect-info',     label: 'Collect customer information',     emoji: '📝' },
  { value: 'product-qa',       label: 'Answer product questions',         emoji: '💬' },
  { value: 'pre-sales',        label: 'Pre-sales qualification',          emoji: '🔍' },
  { value: 'after-sales',      label: 'After-sales support',              emoji: '🛠️' },
  { value: 'quotation',        label: 'Handle pricing & quotations',      emoji: '💰' },
  { value: 'transfer-human',   label: 'Escalate high-intent to human',    emoji: '🙋' },
]

const STEPS = ['Company Basics', 'AI Goals', 'Materials', 'Preview', 'Enable']

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <form onSubmit={submit} className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-sm space-y-4">
        <div className="text-center mb-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 mb-3 shadow-md">
            <span className="text-white text-2xl font-bold">O</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Set Up Omni</h1>
          <p className="text-sm text-gray-400 mt-1">Sign in to start the onboarding wizard</p>
        </div>
        {err && <p className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-2">{err}</p>}
        <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400" placeholder="Tenant slug" value={slug} onChange={e => setSlug(e.target.value)} required />
        <input type="email" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
        <input type="password" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400" placeholder="Password" value={pass} onChange={e => setPass(e.target.value)} required />
        <button type="submit" disabled={busy} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">{busy ? 'Signing in…' : 'Sign In'}</button>
      </form>
    </div>
  )
}

// ── Main Onboarding Wizard ────────────────────────────────────────────────────
export default function OnboardingPage() {
  const [authed,   setAuthed]   = useState(false)
  const [step,     setStep]     = useState(0)
  const [busy,     setBusy]     = useState(false)
  const [error,    setError]    = useState('')
  const [preview,  setPreview]  = useState<OnboardingPreview | null>(null)
  const [enabled,  setEnabled]  = useState(false)

  // Form state
  const [companyName,    setCompanyName]    = useState('')
  const [industry,       setIndustry]       = useState('')
  const [whatsappNumber, setWhatsappNumber] = useState('')
  const [website,        setWebsite]        = useState('')
  const [serviceArea,    setServiceArea]    = useState('')
  const [businessHours,  setBusinessHours]  = useState('Mon-Fri 9:00-18:00')
  const [aiGoals,        setAiGoals]        = useState<string[]>([])
  const [materialsText,  setMaterialsText]  = useState('')
  const [materialsUrl,   setMaterialsUrl]   = useState('')

  useEffect(() => {
    const token = getToken()
    if (!token) return
    setAuthed(true)
    // Load existing draft if any
    fetchOnboardingStatus().then((s) => {
      if (s.hasStarted) {
        setCompanyName(s.companyName ?? '')
        setIndustry(s.industry ?? '')
        if (s.hasPreview) setStep(3)
        else if (s.status) setStep(1)
      }
    }).catch(() => null)
  }, [])

  const toggleGoal = (g: string) =>
    setAiGoals(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])

  async function saveDraft(stepNum?: number) {
    setBusy(true); setError('')
    try {
      await saveOnboardingDraft({
        companyName, industry, whatsappNumber, website, serviceArea, businessHours,
        aiGoals, materialsText, materialsUrl,
        completedSteps: stepNum ?? step,
      })
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed') }
    finally { setBusy(false) }
  }

  async function handleNext() {
    if (step === 0 && (!companyName.trim() || !industry)) {
      setError('Company name and industry are required'); return
    }
    if (step === 1 && aiGoals.length === 0) {
      setError('Select at least one AI goal'); return
    }
    setError('')
    await saveDraft(step + 1)
    if (step < 3) setStep(s => s + 1)
  }

  async function handleGeneratePreview() {
    setBusy(true); setError('')
    try {
      await saveDraft(3)
      const result = await generateOnboardingPreview()
      setPreview(result.preview)
      setStep(3)
    } catch (e) { setError(e instanceof Error ? e.message : 'Preview failed') }
    finally { setBusy(false) }
  }

  async function handleEnable() {
    setBusy(true); setError('')
    try {
      await enableOnboarding()
      setEnabled(true)
      setStep(4)
    } catch (e) { setError(e instanceof Error ? e.message : 'Enable failed') }
    finally { setBusy(false) }
  }

  if (!authed) return <LoginForm onLogin={() => setAuthed(true)} />

  // ── Step indicator ────────────────────────────────────────────────────────
  const StepBar = () => (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((label, i) => (
        <div key={i} className="flex items-center flex-1 last:flex-none">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${i < step ? 'bg-blue-600 text-white' : i === step ? 'bg-blue-600 text-white ring-4 ring-blue-100' : 'bg-gray-100 text-gray-400'}`}>
            {i < step ? '✓' : i + 1}
          </div>
          <div className={`flex-1 h-1 ${i < STEPS.length - 1 ? (i < step ? 'bg-blue-600' : 'bg-gray-100') : 'hidden'}`} />
        </div>
      ))}
    </div>
  )

  if (enabled) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white rounded-3xl shadow-xl p-10 max-w-md w-full text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Omni is Configured!</h2>
          <p className="text-sm text-gray-500 mb-6">Your AI customer service assistant is set up and ready. Next steps: connect your WhatsApp channel in Settings, then go live.</p>
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-700 mb-6">
            <strong>Note:</strong> WhatsApp channel connection and real send are separate steps — configure under Settings → Channels. Real send is currently disabled for safety.
          </div>
          <div className="flex gap-3">
            <a href="/boss" className="flex-1 bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold text-center hover:bg-blue-700">Boss Dashboard →</a>
            <a href="/inbox" className="flex-1 bg-gray-100 text-gray-700 rounded-xl py-3 text-sm font-semibold text-center hover:bg-gray-200">Inbox →</a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm font-bold">O</span>
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900">Setup Wizard</h1>
            <p className="text-xs text-gray-400">Set up your WhatsApp AI customer service</p>
          </div>
        </div>
        <a href="/boss" className="text-xs text-blue-500 hover:text-blue-700">← Dashboard</a>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        <StepBar />

        {error && <div className="bg-red-50 border border-red-200 text-red-600 rounded-2xl px-5 py-3 text-sm mb-5">{error}</div>}

        {/* Step 0: Company Basics */}
        {step === 0 && (
          <div className="bg-white rounded-3xl shadow-sm p-8 space-y-5">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Company Basics</h2>
              <p className="text-sm text-gray-400 mt-1">Tell us about your business so we can configure the right AI assistant.</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Company Name *</label>
                <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400" placeholder="e.g. Sunshine Property" value={companyName} onChange={e => setCompanyName(e.target.value)} required />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Industry *</label>
                <select className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400 bg-white" value={industry} onChange={e => setIndustry(e.target.value)} required>
                  <option value="">Select your industry…</option>
                  {INDUSTRIES.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">WhatsApp Number (optional)</label>
                <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400" placeholder="e.g. +60 12-345 6789" value={whatsappNumber} onChange={e => setWhatsappNumber(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Website (optional)</label>
                  <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400" placeholder="https://…" value={website} onChange={e => setWebsite(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Service Area (optional)</label>
                  <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400" placeholder="e.g. Kuala Lumpur" value={serviceArea} onChange={e => setServiceArea(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Business Hours (optional)</label>
                <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400" placeholder="e.g. Mon-Fri 9:00-18:00" value={businessHours} onChange={e => setBusinessHours(e.target.value)} />
              </div>
            </div>
            <button onClick={handleNext} disabled={busy} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 text-sm font-bold disabled:opacity-50">Next: AI Goals →</button>
          </div>
        )}

        {/* Step 1: AI Goals */}
        {step === 1 && (
          <div className="bg-white rounded-3xl shadow-sm p-8 space-y-5">
            <div>
              <h2 className="text-xl font-bold text-gray-900">What should your AI do?</h2>
              <p className="text-sm text-gray-400 mt-1">Select the goals for your WhatsApp AI assistant. This shapes the AI persona, replies, and follow-up rules.</p>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {AI_GOALS.map(({ value, label, emoji }) => (
                <button
                  key={value}
                  onClick={() => toggleGoal(value)}
                  className={`flex items-center gap-3 text-left rounded-2xl border p-4 transition-all ${aiGoals.includes(value) ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-200' : 'border-gray-200 hover:border-blue-200 hover:bg-blue-50/30'}`}
                >
                  <span className="text-2xl">{emoji}</span>
                  <span className="text-sm font-medium text-gray-800">{label}</span>
                  {aiGoals.includes(value) && <span className="ml-auto text-blue-600">✓</span>}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(0)} className="flex-1 bg-gray-100 text-gray-600 rounded-xl py-3 text-sm font-medium hover:bg-gray-200">← Back</button>
              <button onClick={handleNext} disabled={busy || aiGoals.length === 0} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 text-sm font-bold disabled:opacity-50">Next: Materials →</button>
            </div>
          </div>
        )}

        {/* Step 2: Materials */}
        {step === 2 && (
          <div className="bg-white rounded-3xl shadow-sm p-8 space-y-5">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Your Products & Services</h2>
              <p className="text-sm text-gray-400 mt-1">Paste your product/service information. This will be used to configure AI knowledge and follow-up messages.</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Product / Service Description</label>
                <textarea
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                  rows={8}
                  placeholder={`Paste your product/service details here.\n\nExamples:\n- Product names and prices\n- Key features and benefits\n- Service packages\n- FAQ answers\n- Unique selling points`}
                  value={materialsText}
                  onChange={e => setMaterialsText(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Reference URL (optional)</label>
                <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400" placeholder="https://your-website.com/products" value={materialsUrl} onChange={e => setMaterialsUrl(e.target.value)} />
                <p className="text-xs text-gray-400 mt-1">PDF/file upload coming soon. For now, paste your content above.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="flex-1 bg-gray-100 text-gray-600 rounded-xl py-3 text-sm font-medium hover:bg-gray-200">← Back</button>
              <button onClick={handleGeneratePreview} disabled={busy} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 text-sm font-bold disabled:opacity-50">
                {busy ? 'Generating…' : '✨ Generate Preview →'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Preview */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="bg-white rounded-3xl shadow-sm p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-1">AI Configuration Preview</h2>
              <p className="text-sm text-gray-400 mb-5">Generated from your inputs using deterministic templates. No real AI provider was called.</p>

              {preview ? (
                <div className="space-y-5">
                  {/* AI Persona */}
                  <div className="bg-blue-50 rounded-2xl p-5">
                    <h3 className="text-sm font-bold text-blue-800 mb-2">🤖 AI Persona</h3>
                    <p className="text-sm text-blue-900"><strong>{preview.aiPersona.name}</strong> — {preview.aiPersona.tone}</p>
                    <p className="text-xs text-blue-700 mt-1">Focus: {preview.aiPersona.focus}</p>
                  </div>

                  {/* Welcome Message */}
                  <div className="bg-gray-50 rounded-2xl p-5">
                    <h3 className="text-sm font-bold text-gray-700 mb-2">👋 Welcome Message</h3>
                    <p className="text-sm text-gray-800 leading-relaxed">{preview.welcomeMessage}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* FAQ Categories */}
                    <div className="bg-gray-50 rounded-2xl p-4">
                      <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">FAQ Categories</h3>
                      <ul className="space-y-1">
                        {preview.faqCategories.map((c, i) => <li key={i} className="text-xs text-gray-700">• {c}</li>)}
                      </ul>
                    </div>
                    {/* Follow-up Scenarios */}
                    <div className="bg-gray-50 rounded-2xl p-4">
                      <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Follow-up Scenarios</h3>
                      <ul className="space-y-1">
                        {preview.followUpScenarios.map((s, i) => <li key={i} className="text-xs text-gray-700">• {s.replace(/_/g, ' ')}</li>)}
                      </ul>
                    </div>
                  </div>

                  {/* Tags */}
                  <div>
                    <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Recommended Tags</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {preview.recommendedTags.map((t, i) => <span key={i} className="bg-blue-50 text-blue-600 text-xs px-2.5 py-1 rounded-full">#{t}</span>)}
                    </div>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-xs text-amber-700">
                    <strong>Note:</strong> {preview.note}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-3xl mb-2">⚙️</p>
                  <p className="text-sm">Generating your preview…</p>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="flex-1 bg-gray-100 text-gray-600 rounded-xl py-3 text-sm font-medium hover:bg-gray-200">← Edit Materials</button>
              <button onClick={handleEnable} disabled={busy || !preview} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-3 text-sm font-bold disabled:opacity-50">
                {busy ? 'Enabling…' : '🚀 Enable Configuration →'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
