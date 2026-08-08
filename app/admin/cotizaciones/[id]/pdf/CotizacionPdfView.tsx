'use client'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { CotizacionConDatos, ConfigMap, TotalesDocumento } from '@/types'
import HojaEjecutiva from './HojaEjecutiva'
import HojaMinimalista from './HojaMinimalista'
import HojaCatalogo from './HojaCatalogo'
import styles from './pdf.module.css'

export type EstiloCotizacion = 'ejecutivo' | 'minimalista' | 'catalogo'

// Datos de empresa derivados de `configuracion` en el server (mismas keys que
// lee DocumentoHoja del papel fiscal). Se pasa ya resuelto a las hojas para que
// cada una imprima el emisor sin volver a hurgar en el ConfigMap.
export interface EmpresaPdf {
  nombre: string
  razonSocial: string | null
  rtn: string | null
  domicilio: string | null
  telefono: string | null
  logoUrl: string | null
}

// Contrato único de las 3 hojas: todas reciben exactamente los mismos props.
export interface HojaProps {
  cotizacion: CotizacionConDatos
  totales: TotalesDocumento
  empresa: EmpresaPdf
  config: ConfigMap
  vencida: boolean
  imagenesPorProducto?: Record<string, string>
}

interface Props extends HojaProps {
  estilo: EstiloCotizacion
}

const ESTILOS: { id: EstiloCotizacion; label: string }[] = [
  { id: 'ejecutivo', label: 'Ejecutivo' },
  { id: 'minimalista', label: 'Minimalista' },
  { id: 'catalogo', label: 'Catálogo' },
]

// Formatea una fecha `YYYY-MM-DD` (columna date) en español largo, anclada a
// UTC para no correrse un día por la zona horaria del navegador.
export function fechaLarga(fechaYmd: string): string {
  return new Date(fechaYmd + 'T00:00:00Z').toLocaleDateString('es-HN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export default function CotizacionPdfView({ estilo, ...hoja }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function cambiarEstilo(nuevo: EstiloCotizacion) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('estilo', nuevo)
    router.replace(`${pathname}?${params.toString()}`)
  }

  return (
    <div className={styles.page}>
      <div className={`${styles.toolbar} ${styles.noPrint}`}>
        <div className={styles.toolbarLeft}>
          <Link href="/admin/cotizaciones" className={`btnMerlinTertiary ${styles.btnToolbar}`}>
            ← Cotizaciones
          </Link>
          <span className={styles.toolbarTitulo}>Cotización {hoja.cotizacion.numero}</span>
          {hoja.vencida && <span className={styles.badgeVencida}>VENCIDA</span>}
        </div>
        <div className={styles.toolbarRight}>
          <div className={styles.estiloGroup}>
            {ESTILOS.map(e => (
              <button
                key={e.id}
                type="button"
                className="btnMerlinChip"
                aria-pressed={estilo === e.id}
                onClick={() => cambiarEstilo(e.id)}
              >
                {e.label}
              </button>
            ))}
          </div>
          <button type="button" className={`btnMerlinPrimary ${styles.btnToolbar}`} onClick={() => window.print()}>
            Imprimir
          </button>
        </div>
      </div>

      {estilo === 'ejecutivo' && <HojaEjecutiva {...hoja} />}
      {estilo === 'minimalista' && <HojaMinimalista {...hoja} />}
      {estilo === 'catalogo' && <HojaCatalogo {...hoja} />}
    </div>
  )
}
