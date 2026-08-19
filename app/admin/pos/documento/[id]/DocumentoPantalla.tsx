import Link from 'next/link'
import { numeroDocumento, TIPO_DOCUMENTO_LABEL } from '@/lib/pos/documentos'
import { cambioPago } from '@/lib/pos/emision'
import { LABEL_REEMBOLSO } from '@/lib/pos/devoluciones'
import { formatPrice } from '@/lib/store/format'
import type { Documento, DocumentoItem, DocumentoPagoConMetodo, Caja, NotaCreditoReembolso, PagoPos } from '@/types'
import styles from '../documento.module.css'

interface Props {
  documento: Documento
  items: DocumentoItem[]
  pagos: DocumentoPagoConMetodo[]
  caja: Caja
  // Revisión D2: `documento` solo trae `vendedor_id` (UUID); el nombre sale
  // del embed `vendedores(nombre)` que resuelve `page.tsx` (mismo criterio
  // que ya usan app/admin/reportes/ventas/data.ts y cotizaciones/page.tsx
  // sobre la misma tabla). Un UUID en pantalla no es un dato accionable —
  // no hay dónde pegarlo para obtener el nombre — así que se pide resuelto.
  vendedorNombre: string | null
  // D2: para enlazar cada devolución/NC de este documento a su propia
  // pantalla (bloque "Trazabilidad").
  devoluciones: Array<{
    id: string
    tipo: 'nota_credito' | 'devolucion'
    correlativo: string | null
    numero_comprobante: number | null
    total: number
  }>
  origen: Pick<Documento, 'id' | 'tipo' | 'correlativo' | 'numero_comprobante'> | null
  reembolsos: NotaCreditoReembolso[]
}

// `created_at`/`anulado_at` son timestamps reales (con hora): timeZone
// explícito es obligatorio — Vercel corre en UTC y sin esto la hora sale
// corrida 6 horas en producción (no se nota en local). Mismo criterio que
// formatFechaHora en ClienteFichaView.tsx.
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

/**
 * Pantalla de plataforma de un documento (POS P-detalle D2): la misma
 * información que la hoja imprimible (DocumentoHoja/NotaCreditoHoja), pero
 * navegable en cards — enlaza a cliente, ítems y a la trazabilidad de
 * devoluciones/nota de origen. Lee el mismo snapshot congelado que la hoja;
 * NINGÚN importe se recalcula aquí (todos son columnas de `documento`/
 * `items`/`pagos`/`reembolsos` ya guardadas). La única cifra derivada es el
 * cambio entregado, y sale de `cambioPago` — no de una resta local.
 *
 * Presentación pura: sin estado, sin consultas, sin Server Actions. Las
 * acciones (anular, devolver, imprimir…) las monta `DocumentoView` alrededor
 * de este componente.
 */
export default function DocumentoPantalla({
  documento,
  items,
  pagos,
  caja,
  vendedorNombre,
  devoluciones,
  origen,
  reembolsos,
}: Props) {
  const anulado = documento.estado === 'anulado'
  const esDevolucionDoc = documento.tipo === 'nota_credito' || documento.tipo === 'devolucion'

  // cambioPago espera PagoPos[] (monto + lo mínimo de forma); DocumentoPagoConMetodo
  // no calza 1:1 (trae metodo_nombre/metodo_tipo en vez de tipo) así que se
  // remapea el campo que pide — la resta la hace la función, no este componente.
  const pagosParaCambio: PagoPos[] = pagos.map(p => ({
    metodo_id: p.metodo_id,
    tipo: p.metodo_tipo,
    monto: Number(p.monto),
  }))
  const cambio = cambioPago(pagosParaCambio, Number(documento.total))

  return (
    <div className={styles.pantalla}>
      {/* 1. Emisión — el tipo, el número y los badges los pinta la barra
          superior (sticky, siempre a la vista): repetirlos aquí, a 40px de
          distancia y visibles a la vez, era la misma línea dos veces. */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Emisión</h2>
        <div className={styles.grid}>
          <div className={styles.dato}>
            <span className={styles.datoLabel}>Fecha de emisión</span>
            <span className={styles.datoValor}>{fechaHora(documento.created_at)}</span>
          </div>
          <div className={styles.dato}>
            <span className={styles.datoLabel}>Caja</span>
            <span className={styles.datoValor}>{caja.nombre}</span>
          </div>
          <div className={styles.dato}>
            <span className={styles.datoLabel}>Vendedor</span>
            <span className={styles.datoValor}>{vendedorNombre ?? '—'}</span>
          </div>
          <div className={styles.dato}>
            <span className={styles.datoLabel}>Usuario</span>
            <span className={styles.datoValor}>{documento.usuario ?? '—'}</span>
          </div>
          {/* Revisión final D2: la tasa y el motivo estaban SOLO en el papel
              (DocumentoHoja: "Tasa de cambio"; NotaCreditoHoja: "Motivo").
              Auditar un pago en dólares o saber por qué se emitió una NC
              obligaba a mandar a imprimir — justo lo que esta pantalla viene
              a resolver. Se muestran con el mismo criterio que la hoja. */}
          {documento.tasa_usd != null && (
            <div className={styles.dato}>
              <span className={styles.datoLabel}>Tasa de cambio</span>
              <span className={styles.datoValor}>{formatPrice(Number(documento.tasa_usd))} por US$1.00</span>
            </div>
          )}
          {documento.notas && (
            <div className={styles.dato}>
              <span className={styles.datoLabel}>{esDevolucionDoc ? 'Motivo' : 'Notas'}</span>
              <span className={styles.datoValor}>{documento.notas}</span>
            </div>
          )}
        </div>
      </section>

      {/* 2. Cliente */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Cliente</h2>
        <div className={styles.grid}>
          <div className={styles.dato}>
            <span className={styles.datoLabel}>Nombre</span>
            <span className={styles.datoValor}>
              {documento.cliente_id ? (
                <Link href={`/admin/clientes/${documento.cliente_id}`} className={styles.numeroLink}>
                  {documento.cliente_nombre}
                </Link>
              ) : (
                documento.cliente_nombre
              )}
            </span>
          </div>
          {documento.cliente_rtn && (
            <div className={styles.dato}>
              <span className={styles.datoLabel}>RTN</span>
              <span className={styles.datoValor}>{documento.cliente_rtn}</span>
            </div>
          )}
          {documento.cliente_identidad && (
            <div className={styles.dato}>
              <span className={styles.datoLabel}>Identidad</span>
              <span className={styles.datoValor}>{documento.cliente_identidad}</span>
            </div>
          )}
          {documento.exonerado && (
            <>
              <div className={styles.dato}>
                <span className={styles.datoLabel}>Constancia de exoneración</span>
                <span className={styles.datoValor}>{documento.constancia_exonerado ?? '—'}</span>
              </div>
              <div className={styles.dato}>
                <span className={styles.datoLabel}>Registro SAG</span>
                <span className={styles.datoValor}>{documento.registro_sag ?? '—'}</span>
              </div>
              <div className={styles.dato}>
                <span className={styles.datoLabel}>Orden de compra exenta</span>
                <span className={styles.datoValor}>{documento.orden_compra_exenta ?? '—'}</span>
              </div>
            </>
          )}
        </div>
      </section>

      {/* 3. Ítems */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Ítems</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Descripción</th>
                <th>Cantidad</th>
                <th>Precio unitario</th>
                <th>Descuento</th>
                <th>ISV</th>
                <th>Importe</th>
              </tr>
            </thead>
            <tbody>
              {items.map(it => (
                <tr key={it.id}>
                  <td>
                    {it.producto_id ? (
                      <Link href={`/admin/productos/${it.producto_id}`} className={styles.numeroLink}>
                        {it.descripcion}
                      </Link>
                    ) : (
                      it.descripcion
                    )}
                  </td>
                  <td>{it.cantidad}</td>
                  <td>{formatPrice(Number(it.precio_unitario))}</td>
                  <td>{formatPrice(Number(it.descuento))}</td>
                  <td>{formatPrice(Number(it.isv_monto))}</td>
                  <td>{formatPrice(Number(it.importe))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && <div className={styles.empty}>Este documento no tiene ítems.</div>}
        </div>
      </section>

      {/* 4. Métodos de pago — la migración de P5a no inserta en
          `documento_pagos` para NC/devolución (usan `nota_credito_reembolsos`,
          ver bloque 7), así que esta card no se pinta para esos tipos: no hay
          nada que mostrar, y mostrar una tabla vacía justo encima de
          Reembolsos (donde sí está el dinero) es peor que omitirla. */}
      {(!esDevolucionDoc || pagos.length > 0) && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Métodos de pago</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Método</th>
                  <th>Referencia</th>
                  <th>Monto</th>
                </tr>
              </thead>
              <tbody>
                {pagos.map(p => (
                  <tr key={p.id}>
                    <td>{p.metodo_nombre}</td>
                    {/* Un pago en dólares se guarda convertido a Lempiras: sin
                        el par US$/tasa no hay forma de auditar contra qué se
                        recibió. La hoja lo imprime con este mismo criterio. */}
                    <td>
                      {p.metodo_tipo === 'efectivo_usd' && p.tasa != null
                        ? `US$ ${Number(p.monto_usd ?? 0).toFixed(2)} a ${formatPrice(Number(p.tasa))}${p.referencia ? ` · ${p.referencia}` : ''}`
                        : p.referencia || '—'}
                    </td>
                    <td>{formatPrice(Number(p.monto))}</td>
                  </tr>
                ))}
              </tbody>
              {/* Fila en <tfoot>, con su propia clase de color: es una SALIDA
                  de efectivo, no un pago más — si quedara mezclada en <tbody>
                  con el mismo estilo, la columna Monto sumaría de más contra
                  el total de la card de Totales. El signo "−" lo deja
                  explícito incluso sin el color. */}
              {cambio > 0 && (
                <tfoot>
                  <tr>
                    <td className={styles.cambioMonto} colSpan={2}>Cambio entregado</td>
                    <td className={styles.cambioMonto}>− {formatPrice(cambio)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
            {/* `documento_pagos` vacío es un caso normal, no un dato que
                falte: una venta al crédito y una factura emitida desde un
                pedido se emiten sin pagos. El texto lo dice para que no se
                lea como información perdida. */}
            {pagos.length === 0 && (
              <div className={styles.empty}>Sin pagos registrados (venta al crédito o emitida desde un pedido).</div>
            )}
          </div>
        </section>
      )}

      {/* 5. Totales — todas las cifras son columnas de `documento`, ninguna
          se recalcula; se omiten los renglones en cero salvo el total. */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Totales</h2>
        <div className={styles.totalesLista}>
          {Number(documento.total_exento) > 0 && (
            <div className={styles.totalLinea}><span>Exento</span><span>{formatPrice(Number(documento.total_exento))}</span></div>
          )}
          {Number(documento.total_exonerado) > 0 && (
            <div className={styles.totalLinea}><span>Exonerado</span><span>{formatPrice(Number(documento.total_exonerado))}</span></div>
          )}
          {Number(documento.total_gravado15) > 0 && (
            <div className={styles.totalLinea}><span>Gravado 15%</span><span>{formatPrice(Number(documento.total_gravado15))}</span></div>
          )}
          {Number(documento.total_gravado18) > 0 && (
            <div className={styles.totalLinea}><span>Gravado 18%</span><span>{formatPrice(Number(documento.total_gravado18))}</span></div>
          )}
          {Number(documento.isv15) > 0 && (
            <div className={styles.totalLinea}><span>ISV 15%</span><span>{formatPrice(Number(documento.isv15))}</span></div>
          )}
          {Number(documento.isv18) > 0 && (
            <div className={styles.totalLinea}><span>ISV 18%</span><span>{formatPrice(Number(documento.isv18))}</span></div>
          )}
          {Number(documento.descuento_total) > 0 && (
            <div className={styles.totalLinea}><span>Descuento</span><span>{formatPrice(Number(documento.descuento_total))}</span></div>
          )}
          <div className={`${styles.totalLinea} ${styles.totalLineaFinal}`}>
            <span>Total</span>
            <span>{formatPrice(Number(documento.total))}</span>
          </div>
        </div>
        <p className={styles.enLetras}>{documento.total_letras}</p>
      </section>

      {/* 6. Anulación — hoy solo visible en la hoja imprimible; en pantalla
          quien revisa lo ve sin tener que mandar a imprimir. */}
      {anulado && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Anulación</h2>
          <div className={styles.grid}>
            <div className={styles.dato}>
              <span className={styles.datoLabel}>Motivo</span>
              <span className={styles.datoValor}>{documento.anulado_motivo ?? '—'}</span>
            </div>
            <div className={styles.dato}>
              <span className={styles.datoLabel}>Fecha</span>
              <span className={styles.datoValor}>{documento.anulado_at ? fechaHora(documento.anulado_at) : '—'}</span>
            </div>
          </div>
        </section>
      )}

      {/* 7. Reembolsos — solo si este documento ES una NC/devolución (trae
          sus propios reembolsos, no los de una devolución hecha a partir
          de él, ver bloque 8). */}
      {esDevolucionDoc && reembolsos.length > 0 && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Reembolsos</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Vía</th>
                  <th>Monto</th>
                </tr>
              </thead>
              <tbody>
                {reembolsos.map(r => (
                  <tr key={r.id}>
                    <td>{LABEL_REEMBOLSO[r.tipo]}</td>
                    <td>{formatPrice(Number(r.monto))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 8. Trazabilidad */}
      {(origen || devoluciones.length > 0) && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Trazabilidad</h2>
          {origen && (
            <div className={styles.dato}>
              <span className={styles.datoLabel}>Revierte a</span>
              <span className={styles.datoValor}>
                <Link href={`/admin/pos/documento/${origen.id}`} className={styles.numeroLink}>
                  {TIPO_DOCUMENTO_LABEL[origen.tipo]} {numeroDocumento(origen)}
                </Link>
              </span>
            </div>
          )}
          {devoluciones.length > 0 && (
            <div>
              <h3 className={styles.subTitulo}>Devoluciones de este documento</h3>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Número</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {devoluciones.map(d => (
                      <tr key={d.id}>
                        <td>
                          <Link href={`/admin/pos/documento/${d.id}`} className={styles.numeroLink}>
                            {numeroDocumento(d)}
                          </Link>
                        </td>
                        <td>{formatPrice(Number(d.total))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
