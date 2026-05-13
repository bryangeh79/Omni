import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name:             'Omni Operator Inbox',
    short_name:       'Omni',
    description:      'WhatsApp AI customer service operator inbox',
    start_url:        '/pwa',
    display:          'standalone',
    background_color: '#f9fafb',
    theme_color:      '#2563eb',
    orientation:      'portrait',
    icons: [
      { src: '/icon-192.png',  sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png',  sizes: '512x512', type: 'image/png' },
    ],
  }
}
