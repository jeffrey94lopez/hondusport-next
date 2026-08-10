'use client'
import { useState } from 'react'
import GraficoBarras from './GraficoBarras'
import GraficoLinea from './GraficoLinea'
import type { TopItem, TopCliente, VentaPorDia } from '@/types'
import styles from './dashboard.module.css'

interface Props { ventasPorDia: VentaPorDia[]; topItems: TopItem[]; topClientes: TopCliente[] }

export default function DashboardGraficos({ ventasPorDia, topItems, topClientes }: Props) {
  const [metrica, setMetrica] = useState<'monto' | 'cantidad'>('monto')

  return (
    <div className={styles.graficosGrid}>
      <div className={styles.graficoCard}>
        <h2 className={styles.sectionTitle}>Ventas por día</h2>
        <GraficoLinea puntos={ventasPorDia} />
      </div>
      <div className={styles.graficoCard}>
        <h2 className={styles.sectionTitle}>Ítems más vendidos</h2>
        <GraficoBarras
          filas={topItems.map(t => ({ nombre: t.nombre, monto: t.monto, cantidad: t.cantidad }))}
          metrica={metrica}
          onMetrica={setMetrica}
        />
      </div>
      <div className={styles.graficoCard}>
        <h2 className={styles.sectionTitle}>Mejores clientes</h2>
        <GraficoBarras
          filas={topClientes.map(c => ({ nombre: c.nombre, monto: c.monto, cantidad: c.num_compras, href: `/admin/cuentas-por-cobrar/cliente/${c.cliente_id}` }))}
          metrica={metrica}
          onMetrica={setMetrica}
        />
      </div>
    </div>
  )
}
