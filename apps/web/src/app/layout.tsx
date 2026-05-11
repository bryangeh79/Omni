// Web Admin — root layout skeleton (Next.js App Router)
// Full UI implementation in Phase 4.

export const metadata = {
  title: 'Omni Ai Chatbot — Web Admin',
  description: 'WhatsApp AI Customer Service CRM',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body>{children}</body>
    </html>
  )
}
