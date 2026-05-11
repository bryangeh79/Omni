import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Omni Ai Chatbot — Web Admin',
  description: 'WhatsApp AI Customer Service CRM System',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body>{children}</body>
    </html>
  )
}
