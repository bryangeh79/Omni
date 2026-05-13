import type { Metadata, Viewport } from 'next'
import './globals.css'
import AppNav from '@/components/AppNav'

export const metadata: Metadata = {
  title:       'Omni — WhatsApp AI 客服 · CRM · Follow-up',
  description: 'Omni: WhatsApp AI customer service, CRM, automated follow-up, and lead conversion for SMBs. Not a broadcast or ads platform.',
  manifest:    '/manifest.webmanifest',
  appleWebApp: {
    capable:              true,
    statusBarStyle:       'default',
    title:                'Omni',
  },
}

export const viewport: Viewport = {
  themeColor:    '#6366f1',
  width:         'device-width',
  initialScale:  1,
  maximumScale:  1,
  userScalable:  false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body style={{ margin: 0, display: 'flex', minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <AppNav />
        <main style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
          {children}
        </main>
      </body>
    </html>
  )
}
