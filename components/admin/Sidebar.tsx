'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { signOut } from '@/app/admin/actions'
import { ICONOS, type IconoKey } from './icons'
import styles from './Sidebar.module.css'

const COLAPSADO_KEY = 'hs_admin_sidebar_colapsado'
const GRUPOS_KEY = 'hs_admin_nav_groups'

const INICIO = { href: '/admin', icon: 'inicio' as IconoKey, label: 'Inicio' }

const NAV_GROUPS = [
  {
    label: 'TIENDA',
    items: [
      { href: '/admin/productos', icon: 'productos', label: 'Productos' },
      { href: '/admin/categorias', icon: 'categorias', label: 'Categorías' },
      { href: '/admin/banners', icon: 'banners', label: 'Banners' },
      { href: '/admin/cupones', icon: 'cupones', label: 'Cupones' },
      { href: '/admin/envios', icon: 'envios', label: 'Envíos' },
    ],
  },
  {
    label: 'INGRESOS',
    items: [
      { href: '/admin/pos', icon: 'pos', label: 'POS' },
      { href: '/admin/pos/documentos', icon: 'documentos', label: 'Documentos' },
      { href: '/admin/cotizaciones', icon: 'cotizaciones', label: 'Cotizaciones' },
      { href: '/admin/pedidos', icon: 'pedidos', label: 'Pedidos', badge: true },
      { href: '/admin/cuentas-por-cobrar', icon: 'cxc', label: 'Cuentas por cobrar' },
      { href: '/admin/reportes', icon: 'reportes', label: 'Reportes' },
    ],
  },
  {
    label: 'EGRESOS',
    items: [
      { href: '/admin/compras', icon: 'compras', label: 'Compras' },
      { href: '/admin/cuentas-por-pagar', icon: 'cxp', label: 'Cuentas por pagar' },
    ],
  },
  {
    label: 'INVENTARIO',
    items: [
      { href: '/admin/inventario', icon: 'inventario', label: 'Inventario físico' },
      { href: '/admin/movimientos', icon: 'movimientos', label: 'Movimientos' },
    ],
  },
  {
    label: 'CLIENTES',
    items: [
      { href: '/admin/clientes', icon: 'clientes', label: 'Clientes y proveedores' },
    ],
  },
] as const satisfies ReadonlyArray<{
  label: string
  items: ReadonlyArray<{ href: string; icon: IconoKey; label: string; badge?: boolean }>
}>

interface Props {
  pendingOrders: number
  userName: string
}

// Iniciales para el avatar placeholder del footer de usuario (p. ej. "Ana Gómez" → "AG",
// "admin@hondusport.com" → "A"). Presentación pura, sin reglas de negocio: no va en lib/store.
function getIniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0].slice(0, 1).toUpperCase()
  return (partes[0].slice(0, 1) + partes[partes.length - 1].slice(0, 1)).toUpperCase()
}

export default function Sidebar({ pendingOrders, userName }: Props) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [gruposColapsados, setGruposColapsados] = useState<Record<string, boolean>>({})

  // Guard de montaje (mismo patrón que CartProvider/WishlistProvider): el SSR
  // siempre pinta el estado por defecto (expandido, sin grupos plegados); si el
  // initializer leyera localStorage, el primer render del cliente divergiría del
  // HTML del servidor y React reportaría un hydration mismatch. El estado
  // persistido se aplica recién después de montar.
  const [montado, setMontado] = useState(false)

  useEffect(() => {
    // Carga diferida a propósito: leer localStorage en el initializer
    // reintroduce el hydration mismatch (ver comentario del guard).
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const colapsadoGuardado = localStorage.getItem(COLAPSADO_KEY)
      if (colapsadoGuardado !== null) setCollapsed(colapsadoGuardado === 'true')
      const gruposGuardados = localStorage.getItem(GRUPOS_KEY)
      if (gruposGuardados) setGruposColapsados(JSON.parse(gruposGuardados) as Record<string, boolean>)
    } catch {
      // localStorage inaccesible (modo privado, cuota, etc.): se sigue con los valores por defecto.
    }
    setMontado(true)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  useEffect(() => {
    if (!montado) return
    localStorage.setItem(COLAPSADO_KEY, String(collapsed))
  }, [montado, collapsed])

  useEffect(() => {
    if (!montado) return
    localStorage.setItem(GRUPOS_KEY, JSON.stringify(gruposColapsados))
  }, [montado, gruposColapsados])

  // "Documentos" (/admin/pos/documentos) anida bajo "POS" (/admin/pos): con un
  // simple prefix-match ambos quedarían activos a la vez. Se elige el href más
  // específico (más largo) entre los que matchean, para que solo uno resalte.
  // OJO: /admin (Inicio) NO va aquí — es prefijo de TODAS las rutas admin y se
  // trata como match exacto aparte en isActive, para no "tragarse" ninguna otra
  // ruta (p. ej. /admin/configuracion, que no está en este arreglo).
  const ALL_HREFS = NAV_GROUPS.flatMap(g => g.items.map(i => i.href))

  function isActive(href: string) {
    // Inicio (/admin) es prefijo de todas las rutas admin: activo solo en la ruta exacta,
    // fuera del prefix-matching, para no "tragarse" ninguna otra ruta.
    if (href === '/admin') return pathname === '/admin'
    const matches = ALL_HREFS.filter(h => pathname === h || pathname.startsWith(h + '/'))
    if (matches.length === 0) return pathname === href
    return matches.reduce((a, b) => (b.length > a.length ? b : a)) === href
  }

  const IconoInicio = ICONOS[INICIO.icon]

  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
      <div className={styles.header}>
        <div className={styles.logo}>HS</div>
        {!collapsed && (
          <div className={styles.brandBlock}>
            <span className={styles.brand}>Hondusport Admin</span>
            <span className={styles.brandSub}>Panel de Control</span>
          </div>
        )}
        <button
          className={styles.collapseBtn}
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expandir' : 'Colapsar'}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      <nav className={styles.nav}>
        <Link
          href={INICIO.href}
          className={`${styles.item} ${isActive(INICIO.href) ? styles.active : ''}`}
          title={collapsed ? INICIO.label : undefined}
        >
          <span className={styles.icon}><IconoInicio className="iconoMerlin" /></span>
          {!collapsed && <span className={styles.itemLabel}>{INICIO.label}</span>}
        </Link>

        {NAV_GROUPS.map(group => {
          // El grupo que contiene la ruta activa siempre se muestra expandido
          // (para no esconder dónde está el usuario), sin importar si lo plegó
          // antes. Fuera de ese caso, se respeta el valor persistido y, si no
          // hay ninguno guardado, el grupo arranca expandido.
          const grupoTieneActivo = group.items.some(item => isActive(item.href))
          const grupoColapsado = grupoTieneActivo ? false : (gruposColapsados[group.label] ?? false)

          const alternarGrupo = () => {
            setGruposColapsados(prev => ({ ...prev, [group.label]: !grupoColapsado }))
          }

          return (
            <div key={group.label} className={styles.group}>
              {!collapsed && (
                <button
                  type="button"
                  className={styles.groupLabel}
                  onClick={alternarGrupo}
                  aria-expanded={!grupoColapsado}
                >
                  <span>{group.label}</span>
                  <span className={styles.groupChevron} aria-hidden="true">
                    {grupoColapsado ? '▸' : '▾'}
                  </span>
                </button>
              )}
              {(() => {
                const items = group.items.map(item => {
                  const Icono = ICONOS[item.icon]
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`${styles.item} ${isActive(item.href) ? styles.active : ''}`}
                      title={collapsed ? item.label : undefined}
                    >
                      <span className={styles.icon}><Icono className="iconoMerlin" /></span>
                      {!collapsed && (
                        <span className={styles.itemLabel}>
                          {item.label}
                          {'badge' in item && item.badge && pendingOrders > 0 && (
                            <span className={styles.badge}>{pendingOrders}</span>
                          )}
                        </span>
                      )}
                    </Link>
                  )
                })
                // En colapso total (solo-iconos) el acordeón no aplica: siempre se ven
                // todos los iconos, sin el wrapper de transición del acordeón.
                if (collapsed) return items
                return (
                  <div
                    className={`${styles.groupItems} ${grupoColapsado ? styles.groupItemsCollapsed : ''}`}
                    // Grupo plegado: los <Link> siguen en el DOM (ocultos con
                    // max-height/opacity) pero no deben ser alcanzables con Tab
                    // ni visibles para lectores de pantalla. `inert` los saca
                    // del orden de tabulación y del árbol de accesibilidad de
                    // un solo golpe (soportado en React 19 / Next 16).
                    inert={grupoColapsado}
                  >
                    {items}
                  </div>
                )
              })()}
              <div className={styles.divider} />
            </div>
          )
        })}
      </nav>

      <div className={styles.bottom}>
        <Link
          href="/admin/configuracion"
          className={`${styles.item} ${isActive('/admin/configuracion') ? styles.active : ''}`}
          title={collapsed ? 'Configuración' : undefined}
        >
          <span className={styles.icon}><ICONOS.config className="iconoMerlin" /></span>
          {!collapsed && <span className={styles.itemLabel}>Configuración</span>}
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            className={styles.item}
            title={collapsed ? 'Salir' : undefined}
          >
            <span className={styles.icon}><ICONOS.salir className="iconoMerlin" /></span>
            {!collapsed && <span className={styles.itemLabel}>Salir</span>}
          </button>
        </form>
      </div>

      <div className={styles.userFooter}>
        <span className={styles.avatar}>{getIniciales(userName)}</span>
        {!collapsed && <span className={styles.userName}>{userName}</span>}
      </div>
    </aside>
  )
}
