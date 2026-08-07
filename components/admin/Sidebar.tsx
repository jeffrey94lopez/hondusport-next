'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { signOut } from '@/app/admin/actions'
import styles from './Sidebar.module.css'

const NAV_GROUPS = [
  {
    label: 'TIENDA',
    items: [
      { href: '/admin/productos', icon: '📦', label: 'Productos' },
      { href: '/admin/categorias', icon: '🏷️', label: 'Categorías' },
      { href: '/admin/banners', icon: '🖼️', label: 'Banners' },
    ],
  },
  {
    label: 'VENTAS',
    items: [
      { href: '/admin/pos', icon: '🧾', label: 'POS' },
      { href: '/admin/pos/documentos', icon: '📄', label: 'Documentos' },
      { href: '/admin/pedidos', icon: '📋', label: 'Pedidos', badge: true },
      { href: '/admin/clientes', icon: '👥', label: 'Clientes' },
      { href: '/admin/cupones', icon: '🎟️', label: 'Cupones' },
      { href: '/admin/envios', icon: '🚚', label: 'Envíos' },
    ],
  },
]

interface Props {
  pendingOrders: number
}

export default function Sidebar({ pendingOrders }: Props) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  // "Documentos" (/admin/pos/documentos) anida bajo "POS" (/admin/pos): con un
  // simple prefix-match ambos quedarían activos a la vez. Se elige el href más
  // específico (más largo) entre los que matchean, para que solo uno resalte.
  const ALL_HREFS = NAV_GROUPS.flatMap(g => g.items.map(i => i.href))

  function isActive(href: string) {
    const matches = ALL_HREFS.filter(h => pathname === h || pathname.startsWith(h + '/'))
    if (matches.length === 0) return pathname === href
    return matches.reduce((a, b) => (b.length > a.length ? b : a)) === href
  }

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
        {NAV_GROUPS.map(group => (
          <div key={group.label} className={styles.group}>
            {!collapsed && <span className={styles.groupLabel}>{group.label}</span>}
            {group.items.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.item} ${isActive(item.href) ? styles.active : ''}`}
                title={collapsed ? item.label : undefined}
              >
                <span className={styles.icon}>{item.icon}</span>
                {!collapsed && (
                  <span className={styles.itemLabel}>
                    {item.label}
                    {item.badge && pendingOrders > 0 && (
                      <span className={styles.badge}>{pendingOrders}</span>
                    )}
                  </span>
                )}
              </Link>
            ))}
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
          <span className={styles.icon}>⚙️</span>
          {!collapsed && <span className={styles.itemLabel}>Configuración</span>}
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            className={styles.item}
            title={collapsed ? 'Salir' : undefined}
          >
            <span className={styles.icon}>🚪</span>
            {!collapsed && <span className={styles.itemLabel}>Salir</span>}
          </button>
        </form>
      </div>
    </aside>
  )
}
