// Configuración de envío gratis (clave/valor de `configuracion`), centralizada.
// Antes estaba duplicada como constante + helpers en 6 archivos (StoreClient,
// producto/[slug]/page, ProductPageShell, CheckoutModal, ProductDetail, CartDrawer)
// y con una variante divergente en el Server Action de checkout. Fuente única aquí,
// con test en `lib/store/tests/freeShipping.test.ts`.

/** Umbral por defecto (en L.) cuando `free_shipping_minimo` no está configurado o es inválido. */
export const DEFAULT_FREE_SHIPPING_THRESHOLD = 999

/**
 * Lee un flag booleano de `configuracion`. `undefined` → `defaultValue`;
 * el string `'FALSE'` (en cualquier caja) se trata como desactivado; cualquier otro valor, activado.
 */
export function isConfigActivo(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue
  return value.toUpperCase() !== 'FALSE'
}

/**
 * Resuelve el umbral de envío gratis desde `configuracion.free_shipping_minimo`.
 * Usa `DEFAULT_FREE_SHIPPING_THRESHOLD` si falta, está vacío o no es un número finito.
 */
export function resolveFreeShippingThreshold(value: string | undefined): number {
  const parsed = Number(value)
  return value && Number.isFinite(parsed) ? parsed : DEFAULT_FREE_SHIPPING_THRESHOLD
}
