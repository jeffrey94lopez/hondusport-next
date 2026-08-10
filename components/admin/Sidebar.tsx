'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { signOut } from '@/app/admin/actions'
import { ICONOS, type IconoKey } from './icons'
import styles from './Sidebar.module.css'

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
}

export default function Sidebar({ pendingOrders }: Props) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  // "Documentos" (/admin/pos/documentos) anida bajo "POS" (/admin/pos): con un
  // simple prefix-match ambos quedarían activos a la vez. Se elige el href más
  // específico (más largo) entre los que matchean, para que solo uno resalte.
  const ALL_HREFS = [INICIO.href, ...NAV_GROUPS.flatMap(g => g.items.map(i => i.href))]

  function isActive(href: string) {
    const matches = ALL_HREFS.filter(h => pathname === h || pathname.startsWith(h + '/'))
    if (matches.length === 0) return pathname === href
    return matches.reduce((a, b) => (b.length > a.length ? b : a)) === href
  }

  const IconoInicio = ICONOS[INICIO.icon]

  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
      <div className={styles.header}>
        <div className={styles.logo}>HS</div>
        {!collapsed && <span className={styles.brand}>Hondusport</span>}
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

        {NAV_GROUPS.map(group => (
          <div key={group.label} className={styles.group}>
            {!collapsed && <span className={styles.groupLabel}>{group.label}</span>}
            {group.items.map(item => {
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
            })}
            <div className={styles.divider} />
          </div>
        ))}
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
    </aside>
  )
}
