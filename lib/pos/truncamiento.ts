/**
 * Detección de truncamiento silencioso de PostgREST.
 *
 * PostgREST aplica un tope de filas (`max-rows`) a cualquier consulta que no
 * traiga un `.limit()` explícito, y cuando lo aplica **no falla**: devuelve
 * menos filas sin ninguna señal en el cuerpo de la respuesta. En una lista eso
 * es un bug molesto; en un cálculo de dinero es un número equivocado que se
 * persiste como si fuera correcto.
 *
 * El caso que motivó esto es el cierre de caja: `cerrarSesion` suma los pagos
 * de todos los documentos del turno para congelar `monto_esperado`. Si la
 * consulta truncara, se congelaría un esperado corto y el cajero aparecería
 * con un sobrante que no existe.
 *
 * La defensa es pedir el conteo real (`count: 'exact'`) junto con las filas y
 * comparar: si difieren, la consulta truncó y hay que fallar en vez de operar
 * con datos incompletos. Un `.limit()` más alto solo mueve el techo; esto lo
 * detecta.
 */

/**
 * `true` si la consulta devolvió menos filas de las que existen.
 *
 * `total` es el `count` que devuelve PostgREST con `count: 'exact'`; llega
 * `null` cuando el conteo no se pudo obtener, y en ese caso NO se reporta
 * truncamiento: sin conteo no hay evidencia de que falten filas, y bloquear un
 * cierre de caja por una sospecha sin respaldo sería peor que el riesgo que se
 * intenta cubrir.
 */
export function hayTruncamiento(filasRecibidas: number, total: number | null): boolean {
  if (total == null) return false
  return filasRecibidas < total
}

/**
 * `true` si el conteo no llegó y, por tanto, la guarda quedó inerte para esa
 * consulta.
 *
 * Existe para que el caso "sin conteo" deje rastro en el log. Sin esto, si un
 * proxy dejara de propagar la cabecera `Content-Range`, todos los cierres
 * pasarían a ejecutarse sin protección y nada lo distinguiría de un cierre
 * sano: el arreglo sería inerte y nadie se enteraría. `NaN` cae aquí también:
 * una cabecera de rango sin total (la que termina en barra-asterisco) hace que
 * `parseInt` devuelva `NaN`.
 */
export function sinConteo(total: number | null): boolean {
  return total == null || Number.isNaN(total)
}
