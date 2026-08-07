import styles from './pos.module.css'

// El POS necesita pantalla completa, sin el Sidebar del admin.
//
// Decisión de layout: `app/admin/layout.tsx` renderiza <Sidebar> de forma
// incondicional alrededor de {children} para TODAS las rutas de /admin (no
// hay ningún check de pathname ahí, y es un Server Component sin acceso a la
// ruta actual). Next.js App Router no permite que un layout hijo "apague" a
// un layout padre: la jerarquía de layouts es aditiva por definición. Las
// alternativas para evitar tocar app/admin/layout.tsx (y con ello arriesgar
// las demás rutas admin) eran:
//   1. Mover /admin/pos fuera del segmento /admin (ruta hermana) — rompe la
//      convención de que "todo lo protegido por middleware vive bajo /admin"
//      y el requisito explícito de la tarea de que la ruta sea /admin/pos.
//   2. Convertir AdminLayout en condicional por pathname — requiere leer la
//      ruta en un Server Component (vía headers de middleware) solo para
//      esta pantalla; más invasivo y toca código compartido por 8+ rutas.
//   3. (Elegida) Este layout envuelve {children} en un overlay
//      `position: fixed; inset: 0` con z-index por encima del Sidebar y
//      fondo propio (--bg). El Sidebar del padre se sigue montando en el DOM
//      pero queda visualmente cubierto — cero cambios en app/admin/layout.tsx
//      ni en las demás rutas.
export default function PosLayout({ children }: { children: React.ReactNode }) {
  return <div className={styles.overlay}>{children}</div>
}
