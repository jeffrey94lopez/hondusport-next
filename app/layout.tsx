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
    // La clase de next/font va en <html>, no en <body>: los tokens
    // tipográficos de app/merlin.css (--text-header/title/subtitle/body/caption)
    // se definen en :root, que ES <html>, y referencian --font-poppins. Con la
    // variable declarada solo en <body>, esas cinco custom properties quedaban
    // guaranteed-invalid y se heredaban vacías a toda la app: cualquier
    // `font: var(--text-*)` se ignoraba y el elemento caía al tamaño heredado.
    // Medido antes del arreglo: los h1/h2 de la tienda salían a 15px en vez de
    // 32-48px y 28px.
    <html lang="es" className={poppins.variable}>
      <body>{children}</body>
    </html>
  )
}
