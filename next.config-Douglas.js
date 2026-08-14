/** @type {import('next').NextConfig} */

const securityHeaders = [
  // Impede que o site seja embutido em iframes externos (proteção contra clickjacking)
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Impede que o browser "adivinhe" o tipo de conteúdo (MIME sniffing)
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Ativa o filtro XSS do browser (legacy mas sem custo)
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  // Controla o cabeçalho Referer enviado em navegações
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Desabilita features do browser não utilizadas pela aplicação
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  // Remove o header "X-Powered-By: Next.js" para não revelar stack
  { key: 'X-Powered-By', value: '' },
]

const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000'],
    },
  },
  images: {
    remotePatterns: [],
  },
  // Headers de segurança em todas as respostas
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
  // Remove header X-Powered-By automaticamente
  poweredByHeader: false,
}

module.exports = nextConfig
