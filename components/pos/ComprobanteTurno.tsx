import { formatPrice } from '@/lib/store/format'
import { totalCreditos, totalCobros, diferenciaDetalleArqueo, type DetalleTurno } from '@/lib/pos/turnos'
import type { SesionCaja, MetodoPagoTipo, CobroMetodo } from '@/types'
import styles from './comprobante-turno.module.css'

export interface ComprobanteTurnoProps {
  sesion: SesionCaja
  cajaNombre: string
  empresaNombre: string
  porMetodo: Record<MetodoPagoTipo, number>
  cobrosPorMetodo: Record<CobroMetodo, number>
  devolucionesPorMetodo: Record<CobroMetodo, number>
  cambioEntregado: number
  // Suma EN VIVO del efectivo esperado (la que da `esperadoCaja` al
  // recalcular con los documentos que siguen `emitido` hoy). Puede diferir
  // del arqueo congelado (`sesion.monto_esperado`) si se anuló un comprobante
  // DESPUÉS del cierre — el llamador ya invoca `esperadoCaja` para obtener
  // `porMetodo`/`cobrosPorMetodo`/`cambioEntregado`, así que este total sale
  // de ahí mismo, no de un cálculo nuevo en este componente.
  efectivoEsperadoDetalle: number
  detalle: DetalleTurno
  impresoEn: string // ISO; el llamador lo fija
}

const NOMBRES_METODO: Record<MetodoPagoTipo, string> = {
  efectivo_lps: 'Efectivo L.',
  efectivo_usd: 'Efectivo USD',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  otro: 'Otro',
  credito: 'Crédito otorgado',
  saldo_favor: 'Saldo a favor',
}

// Derivadas de las claves del Record (no un array suelto aparte): si mañana
// se agrega un MetodoPagoTipo nuevo, tsc obliga a completar NOMBRES_METODO y
// esa clave entra aquí sola. Con un array literal separado, un método nuevo
// se imprimiría con nombre pero podría quedar fuera de esta lista sin que
// nada lo señalara — el dinero de ese método desaparecería del papel sin
// error de compilación ni test que lo cubra.
const METODOS_NO_EFECTIVO = (Object.keys(NOMBRES_METODO) as MetodoPagoTipo[])
  .filter(m => m !== 'efectivo_lps' && m !== 'efectivo_usd')

const NOMBRES_COBRO: Record<CobroMetodo, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  cheque: 'Cheque',
  otro: 'Otro',
}

const METODOS_COBRO = Object.keys(NOMBRES_COBRO) as CobroMetodo[]

// Server Components corren en Vercel bajo UTC; sin `timeZone` explícito la
// hora impresa sale corrida 6 horas respecto de Honduras (bug real de R6).
// Este componente no lleva 'use client' (es presentación pura, sin estado ni
// efectos) precisamente para poder renderizarse en servidor, así que esta
// zona horaria explícita no es opcional.
function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-HN', {
    timeZone: 'America/Tegucigalpa',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Los tres valores del arqueo salen de los campos congelados de la sesión.
// `null` significa turno todavía abierto: un turno vivo con dinero en la
// gaveta no puede leerse como uno que cuadró exacto, así que se muestra "—",
// nunca "L. 0.00".
function formatoArqueo(valor: number | null): string {
  return valor == null ? '—' : formatPrice(valor)
}

export default function ComprobanteTurno({
  sesion,
  cajaNombre,
  empresaNombre,
  porMetodo,
  cobrosPorMetodo,
  devolucionesPorMetodo,
  cambioEntregado,
  efectivoEsperadoDetalle,
  detalle,
  impresoEn,
}: ComprobanteTurnoProps) {
  const diferencia = sesion.diferencia
  const diferenciaLabel = diferencia == null ? 'Diferencia' : diferencia === 0 ? 'Cuadra exacto' : diferencia > 0 ? 'Sobrante' : 'Faltante'
  // Colores fijos (no tokens del tema): esta hoja simula papel impreso y su
  // tinta no sigue el modo claro/oscuro de la app.
  const diferenciaColor = diferencia == null ? undefined : diferencia === 0 ? '#0a0a0a' : diferencia > 0 ? '#1b6a3a' : '#910022'

  // Turno abierto: no hay arqueo congelado, así que la suma en vivo es lo
  // único que hay para mostrar; se rotula distinto para no insinuar que es
  // un arqueo cerrado. Cuando sí hay congelado y ambos difieren, es porque un
  // comprobante del turno se anuló DESPUÉS del cierre (ver
  // `diferenciaDetalleArqueo`); el arqueo de arriba sigue siendo el oficial.
  const labelDetalle = sesion.monto_esperado == null ? 'Suma del detalle (turno abierto — sin arqueo)' : 'Suma del detalle'
  const diferenciaDetalle = diferenciaDetalleArqueo(efectivoEsperadoDetalle, sesion.monto_esperado)

  const metodosInformativos = METODOS_NO_EFECTIVO.filter(m => porMetodo[m] > 0)
  const devolucionesPorMetodoConMonto = METODOS_COBRO.filter(m => devolucionesPorMetodo[m] > 0)

  return (
    <div className={styles.pageBg}>
      <div className={styles.hoja80}>
        {/* 1. Encabezado */}
        <header className={styles.header}>
          <div className={styles.empresaNombre}>{empresaNombre}</div>
          <div>Caja: {cajaNombre}</div>
          <div>Usuario: {sesion.usuario || '—'}</div>
        </header>

        <div className={styles.titulo}>COMPROBANTE DE CIERRE DE TURNO</div>

        {/* 2. Turno: apertura y cierre. Si sigue abierto, el cierre es "—". */}
        <div className={styles.seccion}>
          <div className={styles.fila}><span>Apertura</span><span>{fechaHora(sesion.abierta_at)}</span></div>
          <div className={styles.fila}><span>Cierre</span><span>{sesion.cerrada_at ? fechaHora(sesion.cerrada_at) : '—'}</span></div>
        </div>

        {/* 3. Arqueo: sale de los valores CONGELADOS en sesiones_caja, nunca
            de un recálculo — así una reimpresión coincide con la original. */}
        <div className={styles.seccion}>
          <div className={styles.seccionTitulo}>Arqueo</div>
          <div className={styles.fila}><span>Monto inicial</span><span>{formatPrice(sesion.monto_inicial)}</span></div>
          <div className={styles.fila}><span>Efectivo esperado</span><span>{formatoArqueo(sesion.monto_esperado)}</span></div>
          <div className={styles.fila}><span>Efectivo contado</span><span>{formatoArqueo(sesion.monto_contado)}</span></div>
          <div className={`${styles.fila} ${styles.filaTotal}`} style={diferenciaColor ? { color: diferenciaColor } : undefined}>
            <span>{diferenciaLabel}</span>
            <span>{diferencia == null ? '—' : formatPrice(Math.abs(diferencia))}</span>
          </div>
        </div>

        {/* 4. Ingresos por método de pago. La identidad de seis términos que
            el cajero debe poder seguir a mano: monto inicial + efectivo L. +
            efectivo USD − cambio entregado + cobros de CxC en efectivo −
            reembolsos en efectivo = efectivo esperado. Ninguno de los tres
            últimos términos es opcional: con un cobro de CxC en efectivo o
            una devolución, la versión corta (inicial + cobrado − cambio) no
            cuadra y el cajero se queda sin poder explicar la diferencia. */}
        <div className={styles.seccion}>
          <div className={styles.seccionTitulo}>Ingresos por método de pago</div>
          {sesion.monto_inicial !== 0 && (
            <div className={styles.fila}><span>Monto inicial</span><span>{formatPrice(sesion.monto_inicial)}</span></div>
          )}
          {porMetodo.efectivo_lps !== 0 && (
            <div className={styles.fila}><span>Efectivo L. cobrado</span><span>{formatPrice(porMetodo.efectivo_lps)}</span></div>
          )}
          {porMetodo.efectivo_usd !== 0 && (
            <div className={styles.fila}><span>Efectivo USD cobrado (equiv. en L.)</span><span>{formatPrice(porMetodo.efectivo_usd)}</span></div>
          )}
          {cambioEntregado !== 0 && (
            <div className={styles.fila}><span>Cambio entregado</span><span>− {formatPrice(cambioEntregado)}</span></div>
          )}
          {cobrosPorMetodo.efectivo !== 0 && (
            <div className={styles.fila}><span>Cobros de CxC en efectivo</span><span>{formatPrice(cobrosPorMetodo.efectivo)}</span></div>
          )}
          {devolucionesPorMetodo.efectivo !== 0 && (
            <div className={styles.fila}><span>Reembolsos en efectivo</span><span>− {formatPrice(devolucionesPorMetodo.efectivo)}</span></div>
          )}
          {/* Dos totales, no uno: la suma en vivo del detalle (recalculada
              con lo que sigue `emitido` hoy) y el arqueo congelado al
              cerrar. Si un comprobante del turno se anula DESPUÉS del
              cierre, ambos dejan de coincidir — imprimir solo uno de los dos
              haría que el papel afirmara un cuadre que el propio detalle
              visible ya no sostiene (o, al revés, que el detalle "no
              cuadrara" contra un arqueo que en realidad sigue siendo el
              oficial). El arqueo oficial es siempre el segundo renglón. */}
          <div className={styles.fila}>
            <span>{labelDetalle}</span>
            <span>{formatPrice(efectivoEsperadoDetalle)}</span>
          </div>
          <div className={`${styles.fila} ${styles.filaTotal}`}>
            <span>Efectivo esperado (arqueo del cierre)</span>
            <span>{formatoArqueo(sesion.monto_esperado)}</span>
          </div>
          {diferenciaDetalle != null && (
            <div className={styles.advertencia}>
              ⚠ El detalle difiere del arqueo del cierre en {formatPrice(diferenciaDetalle)}. Se anularon documentos
              después de cerrar el turno. El arqueo oficial es el de arriba.
            </div>
          )}

          {metodosInformativos.length > 0 && (
            <div className={styles.subseccion}>
              <div className={styles.nota}>Otros métodos (informativo) — no entran al cuadre de la gaveta:</div>
              {metodosInformativos.map(m => (
                <div key={m} className={styles.fila}><span>{NOMBRES_METODO[m]}</span><span>{formatPrice(porMetodo[m])}</span></div>
              ))}
            </div>
          )}
        </div>

        {/* 5. Créditos otorgados: mercadería que salió sin entrar dinero a
            caja. Se omite el bloque entero si no hubo ninguno. */}
        {detalle.creditos.length > 0 && (
          <div className={styles.seccion}>
            <div className={styles.seccionTitulo}>Créditos otorgados</div>
            <div className={styles.nota}>No entró efectivo a caja.</div>
            {detalle.creditos.map(c => (
              <div key={c.documentoId} className={styles.fila}>
                <span>{c.numero} — {c.cliente}</span>
                <span>{formatPrice(c.monto)}</span>
              </div>
            ))}
            <div className={`${styles.fila} ${styles.filaTotal}`}>
              <span>Total créditos otorgados</span>
              <span>{formatPrice(totalCreditos(detalle.creditos))}</span>
            </div>
          </div>
        )}

        {/* 6. Cobros de CxC recibidos: este sí entró a caja (según el método
            de cada cobro). Se omite el bloque entero si no hubo ninguno. */}
        {detalle.cobros.length > 0 && (
          <div className={styles.seccion}>
            <div className={styles.seccionTitulo}>Cobros de CxC recibidos</div>
            {detalle.cobros.map(c => (
              <div key={c.cobroId} className={styles.fila}>
                <span>{c.numero} — {c.cliente} ({NOMBRES_COBRO[c.metodo]})</span>
                <span>{formatPrice(c.monto)}</span>
              </div>
            ))}
            <div className={`${styles.fila} ${styles.filaTotal}`}>
              <span>Total cobros recibidos</span>
              <span>{formatPrice(totalCobros(detalle.cobros))}</span>
            </div>
          </div>
        )}

        {/* 7. Devoluciones / reembolsos por método. Se omite si no hubo. */}
        {devolucionesPorMetodoConMonto.length > 0 && (
          <div className={styles.seccion}>
            <div className={styles.seccionTitulo}>Devoluciones / reembolsos</div>
            {devolucionesPorMetodoConMonto.map(m => (
              <div key={m} className={styles.fila}><span>{NOMBRES_COBRO[m]}</span><span>{formatPrice(devolucionesPorMetodo[m])}</span></div>
            ))}
          </div>
        )}

        {/* 8. Pie: obligatorio. `anular_comprobante` no exige sesión abierta,
            así que un comprobante de un turno ya cerrado puede anularse
            después; una reimpresión posterior mostraría un crédito u otro
            monto menos en el desglose por método sin explicación. La fecha y
            hora de impresión es lo que hace explicable esa diferencia entre
            dos copias del mismo turno. El arqueo no se ve afectado: sale de
            los valores congelados. */}
        <div className={styles.pie}>Impreso el {fechaHora(impresoEn)}</div>
      </div>
    </div>
  )
}
