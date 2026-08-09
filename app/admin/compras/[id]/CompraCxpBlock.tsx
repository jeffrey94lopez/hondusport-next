import { estadoPago } from '@/lib/cxp/cxp'
import { hoyHonduras } from '@/lib/cotizaciones/cotizaciones'
import { formatPrice } from '@/lib/store/format'
import type { CompraSaldo, EstadoPago } from '@/types'
import styles from '../compras.module.css'

export interface CxpEditorData {
  saldo: CompraSaldo
  pagos: { numero: string; fecha: string; monto: number }[]
}

interface Props {
  cxp: CxpEditorData
}

const ESTADO_LABEL: Record<EstadoPago, string> = {
  pagada: 'Pagada',
  parcial: 'Parcial',
  pendiente: 'Pendiente',
  vencida: 'Vencida',
}
const ESTADO_BADGE: Record<EstadoPago, string> = {
  pagada: styles.badgeVerde,
  parcial: styles.badgeAmbar,
  pendiente: styles.badgeGris,
  vencida: styles.badgeRojo,
}

function formatFecha(iso: string): string {
  return iso.slice(0, 10)
}

// Deriva el estado de pago sin fecha de vencimiento (compras al crédito
// guardadas antes de tener `dias_credito`, o cualquier caso sin fecha): sin
// fecha contra la cual comparar no se puede determinar 'vencida', así que se
// deriva solo de saldo/pagado. Mismo criterio que
// app/admin/cuentas-por-pagar/actions.ts (aCxpFila).
function estadoSinVencimiento(total: number, pagado: number, saldo: number): EstadoPago {
  if (saldo <= 0) return 'pagada'
  if (pagado > 0) return 'parcial'
  return 'pendiente'
}

// Bloque de solo lectura con el saldo y los pagos de una compra al crédito
// guardada (POS P4b). Sin acciones de pago: el pago se registra desde el
// tablero de Cuentas por pagar, no desde el editor de compra.
export default function CompraCxpBlock({ cxp }: Props) {
  const { saldo, pagos } = cxp
  const estado = saldo.fecha_vencimiento
    ? estadoPago(saldo.total, saldo.pagado, new Date(`${saldo.fecha_vencimiento}T00:00:00Z`), hoyHonduras(new Date()))
    : estadoSinVencimiento(saldo.total, saldo.pagado, saldo.saldo)

  return (
    <section className={styles.cxpBlock}>
      <div className={styles.cxpHeader}>
        <h2 className={styles.cxpTitle}>Cuenta por pagar</h2>
        <span className={`${styles.badge} ${ESTADO_BADGE[estado]}`}>{ESTADO_LABEL[estado]}</span>
      </div>

      <div className={styles.totalesPanel}>
        <div className={styles.totalesRow}>
          <span>Total</span>
          <span>{formatPrice(saldo.total)}</span>
        </div>
        <div className={styles.totalesRow}>
          <span>Pagado</span>
          <span>{formatPrice(saldo.pagado)}</span>
        </div>
        <div className={styles.totalesRowTotal}>
          <span>Saldo</span>
          <span>{formatPrice(saldo.saldo)}</span>
        </div>
      </div>

      <div className={styles.cxpPagos}>
        <h3 className={styles.cxpPagosTitle}>Pagos aplicados</h3>
        {pagos.length === 0 ? (
          <div className={styles.empty}>Sin pagos registrados.</div>
        ) : (
          <div className={styles.cxpPagosList}>
            {pagos.map((p, i) => (
              <div key={`${p.numero}-${i}`} className={styles.cxpPagoRow}>
                <span className={styles.cxpPagoNumero}>{p.numero}</span>
                <span className={styles.cxpPagoFecha}>{formatFecha(p.fecha)}</span>
                <span className={styles.cxpPagoMonto}>{formatPrice(p.monto)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
