import type { Metadata } from 'next'
import { Poppins } from 'next/font/google'
import './merlin.css'
import './globals.css'

const poppins = Poppins({
  weight: ['400', '500', '600', '700', '800'],
  subsets: ['latin'],
  variable: '--font-poppins',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Hondusport',
  description: 'Tienda deportiva en Honduras',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={poppins.variable}>{children}</body>
    </html>
  )
}
