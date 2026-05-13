import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title:       'Omni Ai Chatbot — Web Admin',
  description: 'WhatsApp AI Customer Service CRM System',
  manifest:    '/manifest.webmanifest',
  appleWebApp: {
    capable:              true,
    statusBarStyle:       'default',
    title:                'Omni',
  },
}

export const viewport: Viewport = {
  themeColor:    '#2563eb',
  width:         'device-width',
  initialScale:  1,
  maximumScale:  1,
  userScalable:  false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body>{children}</body>
    </html>
  )
}
