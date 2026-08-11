// Set de iconos SVG para el menú del admin (POS P6).
// Estilo "feather": trazos simples, `stroke="currentColor"`, `fill="none"`.
// El color dorado y el tamaño los da la clase `.iconoMerlin` (app/merlin.css);
// estos componentes solo dibujan la forma.
import type { JSX } from 'react'

type IconProps = { className?: string }

const base = (path: JSX.Element, className?: string) => (
  <span className={className}>
    <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {path}
    </svg>
  </span>
)

export const IconInicio = ({ className }: IconProps) =>
  base(<><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></>, className)

export const IconProductos = ({ className }: IconProps) =>
  base(<><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 7v10l9 4 9-4V7" /><path d="M12 11v10" /></>, className)

export const IconCategorias = ({ className }: IconProps) =>
  base(<><path d="M20 12l-8 8-9-9 8-8h9v9z" /><circle cx="15" cy="8" r="1.5" /></>, className)

export const IconBanners = ({ className }: IconProps) =>
  base(<><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="M3 16l5-5 4 4 3-3 6 6" /></>, className)

export const IconCupones = ({ className }: IconProps) =>
  base(<><rect x="3" y="6" width="18" height="12" rx="2" /><line x1="9" y1="6" x2="9" y2="18" /></>, className)

export const IconEnvios = ({ className }: IconProps) =>
  base(<><rect x="1" y="8" width="13" height="8" rx="1" /><path d="M14 11h4l3 3v2h-7z" /><circle cx="5.5" cy="18" r="1.5" /><circle cx="16.5" cy="18" r="1.5" /></>, className)

export const IconPos = ({ className }: IconProps) =>
  base(<><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="9" y1="12" x2="15" y2="12" /></>, className)

export const IconDocumentos = ({ className }: IconProps) =>
  base(<><path d="M6 3h9l3 3v15H6z" /><path d="M15 3v3h3" /><line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="16" x2="15" y2="16" /></>, className)

export const IconCotizaciones = ({ className }: IconProps) =>
  base(<><path d="M6 3h9l3 3v15H6z" /><path d="M15 3v3h3" /><path d="M9 17l1-3 5-5 2 2-5 5-3 1z" /></>, className)

export const IconPedidos = ({ className }: IconProps) =>
  base(<><line x1="9" y1="6" x2="20" y2="6" /><line x1="9" y1="12" x2="20" y2="12" /><line x1="9" y1="18" x2="20" y2="18" /><path d="M4 6l1 1 2-2" /><path d="M4 12l1 1 2-2" /><path d="M4 18l1 1 2-2" /></>, className)

export const IconCxc = ({ className }: IconProps) =>
  base(<><path d="M3 20h18" /><path d="M6 16l4-4 3 3 5-6" /><path d="M18 9h3v3" /></>, className)

export const IconCompras = ({ className }: IconProps) =>
  base(<><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M3 4h2l2.4 12h11.2L21 8H6" /></>, className)

export const IconCxp = ({ className }: IconProps) =>
  base(<><path d="M3 4h18" /><path d="M6 8l4 4 3-3 5 6" /><path d="M18 15h3v-3" /></>, className)

export const IconInventario = ({ className }: IconProps) =>
  base(<><rect x="4" y="14" width="7" height="6" /><rect x="13" y="14" width="7" height="6" /><rect x="8.5" y="6" width="7" height="6" /></>, className)

export const IconMovimientos = ({ className }: IconProps) =>
  base(<><path d="M4 7h13" /><path d="M14 3l3 4-3 4" /><path d="M20 17H7" /><path d="M10 13l-3 4 3 4" /></>, className)

export const IconClientes = ({ className }: IconProps) =>
  base(<><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0112 0" /><path d="M16 6a3 3 0 010 6" /><path d="M15 20a6 6 0 019-5" /></>, className)

export const IconConfig = ({ className }: IconProps) =>
  base(<><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>, className)

export const IconSalir = ({ className }: IconProps) =>
  base(<><path d="M9 3H5a2 2 0 00-2 2v14a2 2 0 002 2h4" /><path d="M15 17l5-5-5-5" /><line x1="20" y1="12" x2="9" y2="12" /></>, className)

export const IconReportes = ({ className }: IconProps) =>
  base(<><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M21 20H3" /></>, className)

export const IconVentas = ({ className }: IconProps) =>
  base(<><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></>, className)

export const ICONOS = {
  inicio: IconInicio,
  productos: IconProductos,
  categorias: IconCategorias,
  banners: IconBanners,
  cupones: IconCupones,
  envios: IconEnvios,
  pos: IconPos,
  documentos: IconDocumentos,
  cotizaciones: IconCotizaciones,
  pedidos: IconPedidos,
  cxc: IconCxc,
  compras: IconCompras,
  cxp: IconCxp,
  inventario: IconInventario,
  movimientos: IconMovimientos,
  clientes: IconClientes,
  config: IconConfig,
  salir: IconSalir,
  reportes: IconReportes,
  ventas: IconVentas,
} as const

export type IconoKey = keyof typeof ICONOS
