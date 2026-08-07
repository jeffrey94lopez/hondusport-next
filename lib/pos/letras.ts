const UNIDADES = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE']

const DIECI = [
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE',
  'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE',
]

const VEINTI = [
  'VEINTIÚN', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO',
  'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE',
]

const DECENAS = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']

const CENTENAS = [
  '', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS',
  'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS',
]

/** Convierte un número de 1 a 99 a letras (sin apocope especial fuera de VEINTIÚN/UN). */
function convertirDecenas(n: number): string {
  if (n < 10) return UNIDADES[n]
  if (n < 20) return DIECI[n - 10]
  const decena = Math.floor(n / 10)
  const unidad = n % 10
  if (unidad === 0) return DECENAS[decena]
  if (decena === 2) return VEINTI[unidad - 1]
  return `${DECENAS[decena]} Y ${UNIDADES[unidad]}`
}

/** Convierte un número de 0 a 999 a letras. */
function convertirGrupo(n: number): string {
  if (n === 0) return ''
  if (n === 100) return 'CIEN'
  const centenas = Math.floor(n / 100)
  const resto = n % 100
  const partes: string[] = []
  if (centenas > 0) partes.push(CENTENAS[centenas])
  if (resto > 0) partes.push(convertirDecenas(resto))
  return partes.join(' ')
}

/** Convierte un entero no negativo a letras, con estilo factura HN ("UN MIL" en vez de "MIL"). */
function numeroEnteroALetras(n: number): string {
  if (n === 0) return 'CERO'
  const millones = Math.floor(n / 1_000_000)
  const resto1 = n % 1_000_000
  const miles = Math.floor(resto1 / 1000)
  const unidadesGrupo = resto1 % 1000

  const partes: string[] = []
  if (millones > 0) {
    partes.push(millones === 1 ? 'UN MILLÓN' : `${convertirGrupo(millones)} MILLONES`)
  }
  if (miles > 0) {
    partes.push(miles === 1 ? 'UN MIL' : `${convertirGrupo(miles)} MIL`)
  }
  if (unidadesGrupo > 0) {
    partes.push(convertirGrupo(unidadesGrupo))
  }
  return partes.join(' ')
}

/**
 * Convierte un monto en Lempiras a su representación en letras, estilo factura HN:
 * "<ENTERO EN LETRAS> LEMPIRAS CON NN/100" (con "DE" cuando el millón es exacto,
 * es decir, sin miles ni unidades residuales en la parte entera).
 *
 * Trabaja con centavos enteros (`Math.round(monto * 100)`) para evitar el drift
 * de punto flotante.
 */
export function numeroALetras(monto: number): string {
  const centavosTotales = Math.round(monto * 100)
  const entero = Math.floor(centavosTotales / 100)
  const centavos = centavosTotales % 100

  const millonExacto = entero > 0 && entero % 1_000_000 === 0
  const letraEntero = numeroEnteroALetras(entero) + (millonExacto ? ' DE' : '')
  const centavosStr = String(centavos).padStart(2, '0')

  return `${letraEntero} LEMPIRAS CON ${centavosStr}/100`
}
