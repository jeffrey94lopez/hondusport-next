// El overlay fullscreen se aplica ahora en la propia pantalla POS
// (app/admin/pos/page.tsx), NO aquí: así las rutas hermanas bajo /admin/pos
// (documentos, documento/[id]) heredan el shell del admin CON el Sidebar
// visible, en vez de quedar cubiertas por el overlay `fixed`.
export default function PosLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
