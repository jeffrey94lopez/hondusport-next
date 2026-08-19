# P-detalle D3 — Cotización facturada congelada y detalle de ítems en CxP — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una cotización ya facturada no pueda contradecir a su factura, y que Cuentas por pagar muestre qué se está pagando sin salir de la pantalla.

**Architecture:** Dos mitades independientes. La mitad A añade una guarda de integridad en dos Server Actions (releyendo `documento_id` de la BD) y refleja ese bloqueo en el editor y en el tablero. La mitad B añade un Server Action de solo lectura que trae los ítems de una compra bajo demanda, y una fila desplegable en CxP que los pinta. Toda regla con peso vive en `lib/` con test: `puedeEditarCotizacion` e `importeLineaCompra`.

**Tech Stack:** Next.js 16 (App Router, Server Actions), TypeScript, Supabase (PostgREST), Vitest, CSS Modules.

**Spec:** `docs/superpowers/specs/2026-08-18-pdetalle-d3-cotizacion-cxp-design.md`

## Global Constraints

- **Idioma:** UI, nombres de dominio y mensajes de commit en **español**. Moneda en Lempiras, siempre con `formatPrice()`.
- **Ningún importe se recalcula en un componente.** Toda cifra derivada sale de una función pura de `lib/` con test.
- **La guarda de integridad vive en el Server Action**, releyendo de la BD. La UI la refleja; no la sustituye. Nunca se confía en lo que manda el cliente.
- **Sin migraciones.** Esta ola no lleva ninguna. Si alguna tarea parece necesitar uno, es señal de que se entendió mal — para y pregunta.
- **No se tocan:** `DocumentoHoja`, `NotaCreditoHoja`, `HojaOrdenCompra`, `HojaEstadoCuenta`, los PDF de cotización (`app/admin/cotizaciones/[id]/pdf/`), la RPC `registrar_pago_proveedor` ni las reglas de pago, y `/admin/compras/[id]`.
- **Botones:** las clases globales `btnMerlin*` (`btnMerlinPrimary`, `btnMerlinSecondary`, `btnMerlinTertiary`, `btnMerlinIcon`, `btnMerlinChip`) aportan **solo** color, radio y tipografía — **sin padding y sin display**. Todo botón las combina con una clase de layout del módulo, o se pinta como texto suelto.
- **Especificidad en tablas:** una clase aplicada sobre un `<td>` **pierde** contra la regla `td` de la propia tabla. Para ganarle hay que escribir `.table td.miClase`, no `.miClase`.
- **`composes:` debe ser la primera declaración de la regla** en un CSS Module.
- **Zona horaria:** toda fecha formateada en código de servidor lleva `timeZone: 'America/Tegucigalpa'`. Vercel corre en UTC y sin eso las horas salen seis horas corridas — no se nota en local.
- **Tokens Merlin** de `app/merlin.css`; no hardcodear un valor que ya tiene token.
- **Al cerrar cada tarea:** `npx tsc --noEmit`, `npm test`, `npm run build` y `npx eslint <rutas tocadas>` deben salir verdes, y se reportan los números reales. La línea base al empezar esta ola es **46 archivos / 642 tests**.
- **No ejecutar `rm -rf .next` encadenado con `npm test`**: en este repo (OneDrive) eso hace que vitest se salte archivos en silencio y reporte un verde incompleto.

---

## Estructura de archivos

**Mitad A — cotización facturada congelada**

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `lib/cotizaciones/cotizaciones.ts` | Añade `puedeEditarCotizacion` — la regla, en un solo sitio | 1 |
| `lib/cotizaciones/tests/cotizaciones.test.ts` | Test de la regla | 1 |
| `app/admin/cotizaciones/actions.ts` | Guarda en `guardarCotizacion` y `eliminarCotizacion` | 2 |
| `app/admin/cotizaciones/[id]/page.tsx` | Carga el documento enlazado para el badge | 3 |
| `app/admin/cotizaciones/[id]/CotizacionEditor.tsx` | Modo lectura + badge-enlace | 3 |
| `app/admin/cotizaciones/[id]/editor.module.css` | Estilos del aviso de bloqueo y del badge-enlace | 3 |
| `app/admin/cotizaciones/KanbanBoard.tsx` | Oculta Eliminar en la tarjeta facturada | 3 |

**Mitad B — detalle de ítems en CxP**

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `lib/compras/compras.ts` | Añade `importeLineaCompra` | 4 |
| `lib/compras/tests/compras.test.ts` | Test de la función y de la reconciliación con `totalCompra` | 4 |
| `app/admin/cuentas-por-pagar/actions.ts` | `obtenerItemsCompra` con límite y verificación de conteo | 5 |
| `app/admin/cuentas-por-pagar/CuentasPorPagarClient.tsx` | Enlace + fila desplegable | 6 |
| `app/admin/cuentas-por-pagar/cxp.module.css` | Estilos de la fila desplegable | 6 |

Las dos mitades no comparten ningún archivo. Las tareas 1-3 son independientes de las 4-6.

---

## Task 1: La regla `puedeEditarCotizacion`, en `lib/` y con test

**Files:**
- Modify: `lib/cotizaciones/cotizaciones.ts` (añadir al final del archivo)
- Test: `lib/cotizaciones/tests/cotizaciones.test.ts` (añadir un bloque `describe` al final)

**Interfaces:**
- Consumes: nada.
- Produces: `puedeEditarCotizacion(documentoId: string | null): boolean` — exportada desde `lib/cotizaciones/cotizaciones.ts`. La consumen la Task 2 (dos Server Actions) y la Task 3 (el editor y el tablero).

**Por qué una función para algo tan corto:** la consumen cuatro sitios en tres archivos. En la ola anterior (D2) el mismo tipo de condición se escribió dos veces — en la lista y en el detalle — y la revisión tuvo que verificar a mano que no hubieran divergido. Tenerla en un solo lugar hace imposible esa divergencia, y el test es lo que documenta la regla.

- [ ] **Step 1: Escribir el test que falla**

Añade al final de `lib/cotizaciones/tests/cotizaciones.test.ts`:

```ts
describe('puedeEditarCotizacion', () => {
  it('una cotización sin documento se edita', () => {
    expect(puedeEditarCotizacion(null)).toBe(true)
  })

  // Una cotización con documento_id ya produjo un documento fiscal: es su
  // respaldo comercial y no puede cambiar después. La vía para seguir
  // trabajando sobre ella es duplicarla (duplicarCotizacion crea la copia
  // sin documento_id).
  it('una cotización ya facturada NO se edita', () => {
    expect(puedeEditarCotizacion('0d8d47ce-a55f-424a-9354-9c2fbf500f29')).toBe(false)
  })

  // Defensa contra una fila con la columna en cadena vacía: no es un
  // documento real, pero tampoco debe abrir la puerta por accidente si
  // alguna vez llegara así. Se trata como "sin documento".
  it('cadena vacía cuenta como sin documento', () => {
    expect(puedeEditarCotizacion('')).toBe(true)
  })
})
```

Y añade `puedeEditarCotizacion` a la lista de imports de la primera línea del archivo, que hoy es:

```ts
import { numeroCotizacion, validoHasta, estaVencida, hoyHonduras, agruparPorEtapa, etapaGanadaDestino } from '../cotizaciones'
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/cotizaciones/tests/cotizaciones.test.ts`
Expected: FAIL — `puedeEditarCotizacion is not a function` (o error de import).

- [ ] **Step 3: Implementar**

Añade al final de `lib/cotizaciones/cotizaciones.ts`:

```ts
/**
 * ¿Se puede editar (o eliminar) esta cotización?
 *
 * Una cotización con `documento_id` ya produjo un documento fiscal y es su
 * respaldo comercial: si cambiara después, dejaría de coincidir con la
 * factura. Antes de D3 nada lo impedía — `guardarCotizacion` borraba y
 * reinsertaba todas las líneas releyendo los precios del día.
 *
 * El bloqueo es permanente, también si el documento se anula después: la
 * factura existió. La vía para seguir trabajando es `duplicarCotizacion`,
 * que crea la copia sin `documento_id`.
 *
 * La consumen las dos Server Actions y la UI: una sola regla para que
 * pantalla y servidor no puedan divergir.
 */
export function puedeEditarCotizacion(documentoId: string | null): boolean {
  return !documentoId
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run lib/cotizaciones/tests/cotizaciones.test.ts`
Expected: PASS — todos los tests del archivo, incluidos los que ya había.

- [ ] **Step 5: Verificación completa**

Run: `npx tsc --noEmit` — Expected: sin salida.
Run: `npm test` — Expected: 46 archivos, 645 tests (642 de base + 3 nuevos).
Run: `npx eslint lib/cotizaciones` — Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add lib/cotizaciones/cotizaciones.ts lib/cotizaciones/tests/cotizaciones.test.ts
git commit -m "feat(cotizaciones): regla puedeEditarCotizacion en lib con test (D3)"
```

---

## Task 2: La guarda en los Server Actions

**Files:**
- Modify: `app/admin/cotizaciones/actions.ts` — `guardarCotizacion` (empieza en la línea 75) y `eliminarCotizacion` (línea 208)

**Interfaces:**
- Consumes: `puedeEditarCotizacion(documentoId: string | null): boolean` de `lib/cotizaciones/cotizaciones.ts` (Task 1).
- Produces: el mensaje de error exacto `ERROR_FACTURADA`, que la Task 3 muestra en el editor:
  `'Esta cotización ya fue facturada y no se puede modificar. Duplícala para trabajar sobre una copia.'`

**Esta es la tarea de integridad de la ola.** Todo lo demás es presentación. Si esta guarda no queda bien puesta, el resto no protege nada.

**Tres cosas que hay que entender antes de tocar el archivo:**

1. **`guardarCotizacion` sirve para crear y para actualizar.** Cuando `input.id` es `null` está creando: **no hay nada que proteger**, y la guarda no debe correr. Solo cuando `input.id` tiene valor hay que releer.
2. **`duplicarCotizacion` (línea 232) llama a `guardarCotizacion` con `id: null`.** Si la guarda se pusiera sin distinguir crear de actualizar, duplicar una cotización facturada dejaría de funcionar — y duplicar es justamente la vía de escape que el bloqueo deja abierta. Es el error más fácil de cometer aquí.
3. **La guarda relee `documento_id` de la BD.** No se acepta ningún flag del cliente: `GuardarCotizacionInput` no lo trae y **no debe traerlo**. Es la misma frontera de confianza del checkout.

**Dónde va exactamente en `guardarCotizacion`:** al principio de la función, **antes** de leer el cliente y antes de releer productos. No tiene sentido recalcular precios de una cotización que se va a rechazar.

- [ ] **Step 1: Añadir el import y la constante de error**

En `app/admin/cotizaciones/actions.ts`, la línea 6 hoy es:

```ts
import { numeroCotizacion, validoHasta, hoyHonduras, etapaGanadaDestino } from '@/lib/cotizaciones/cotizaciones'
```

Déjala así:

```ts
import { numeroCotizacion, validoHasta, hoyHonduras, etapaGanadaDestino, puedeEditarCotizacion } from '@/lib/cotizaciones/cotizaciones'
```

Y justo debajo de la constante `ERROR_GENERICO` (línea 11) añade:

```ts
// D3: una cotización ya facturada es el respaldo de un documento fiscal y no
// se modifica ni se borra. El mensaje nombra la salida (duplicar) en vez de
// dejar al usuario sin qué hacer.
const ERROR_FACTURADA =
  'Esta cotización ya fue facturada y no se puede modificar. Duplícala para trabajar sobre una copia.'
```

- [ ] **Step 2: Poner la guarda en `guardarCotizacion`**

La función empieza así (línea 75-77):

```ts
export async function guardarCotizacion(input: GuardarCotizacionInput): Promise<CotizacionResult<{ id: string }>> {
  const supabase = await createClient()

```

Inserta la guarda inmediatamente después de `const supabase = await createClient()`:

```ts
  // D3 — frontera de confianza: una cotización ya facturada no se modifica.
  // Se relee documento_id de la BD (no se acepta ningún flag del cliente) y
  // solo cuando input.id tiene valor: con id null se está CREANDO, y ahí no
  // hay nada que proteger. Esa distinción es la que mantiene vivo a
  // duplicarCotizacion, que llama aquí con id: null y es la vía de escape
  // que el bloqueo deja abierta.
  if (input.id) {
    const { data: actual, error: actualErr } = await supabase
      .from('cotizaciones')
      .select('documento_id')
      .eq('id', input.id)
      .maybeSingle()
    if (actualErr) return { ok: false, error: ERROR_GENERICO }
    if (actual && !puedeEditarCotizacion(actual.documento_id)) {
      return { ok: false, error: ERROR_FACTURADA }
    }
  }

```

- [ ] **Step 3: Poner la guarda en `eliminarCotizacion`**

La función completa hoy es (línea 208):

```ts
export async function eliminarCotizacion(id: string): Promise<CotizacionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('cotizaciones').delete().eq('id', id)
  if (error) return { ok: false, error: ERROR_GENERICO }
  revalidatePath('/admin/cotizaciones')
  return { ok: true }
}
```

Déjala así:

```ts
export async function eliminarCotizacion(id: string): Promise<CotizacionResult> {
  const supabase = await createClient()

  // D3: borrar una cotización facturada dejaría al documento apuntando a
  // nada. Misma relectura y mismo criterio que guardarCotizacion.
  const { data: actual, error: actualErr } = await supabase
    .from('cotizaciones')
    .select('documento_id')
    .eq('id', id)
    .maybeSingle()
  if (actualErr) return { ok: false, error: ERROR_GENERICO }
  if (actual && !puedeEditarCotizacion(actual.documento_id)) {
    return { ok: false, error: ERROR_FACTURADA }
  }

  const { error } = await supabase.from('cotizaciones').delete().eq('id', id)
  if (error) return { ok: false, error: ERROR_GENERICO }
  revalidatePath('/admin/cotizaciones')
  return { ok: true }
}
```

- [ ] **Step 4: NO tocar `moverEtapaCotizacion` ni `duplicarCotizacion`**

Confirma leyendo el archivo que siguen igual que antes:

- `moverEtapaCotizacion` (línea 200) **no lleva guarda**: la etapa del kanban queda fuera del bloqueo a propósito. Congelarla dejaría la tarjeta clavada para siempre en la columna «ganada» a la que la manda `marcarCotizacionFacturada`.
- `duplicarCotizacion` (línea 232) **no lleva guarda**: es la vía de escape.
- `marcarCotizacionFacturada` (línea 268) **no lleva guarda**: es quien pone el `documento_id`, y ya es idempotente por su cuenta.

- [ ] **Step 5: Verificación completa**

Run: `npx tsc --noEmit` — Expected: sin salida.
Run: `npm test` — Expected: 46 archivos, 645 tests (los Server Actions no tienen tests; el conteo no cambia respecto a la Task 1).
Run: `npx eslint app/admin/cotizaciones` — Expected: sin errores.
Run: `npm run build` — Expected: build correcto.

- [ ] **Step 6: Commit**

```bash
git add app/admin/cotizaciones/actions.ts
git commit -m "fix(cotizaciones): impedir editar o borrar una cotizacion ya facturada (D3)"
```

---

## Task 3: Modo lectura en el editor, badge-enlace y tarjeta del tablero

**Files:**
- Modify: `app/admin/cotizaciones/[id]/page.tsx`
- Modify: `app/admin/cotizaciones/[id]/CotizacionEditor.tsx` (1085 líneas — se tocan puntos concretos, no se reestructura)
- Modify: `app/admin/cotizaciones/[id]/editor.module.css`
- Modify: `app/admin/cotizaciones/KanbanBoard.tsx`

**Interfaces:**
- Consumes: `puedeEditarCotizacion(documentoId: string | null): boolean` (Task 1); `ERROR_FACTURADA` como el error que devuelven las acciones (Task 2); `numeroDocumento` y `TIPO_DOCUMENTO_LABEL` de `lib/pos/documentos.ts`, ya en producción desde D1.
- Produces: nada que consuman tareas posteriores.

**El principio que gobierna esta tarea:** el modo lectura se deriva de **una sola variable**, no de una segunda versión del formulario. El editor tiene 1085 líneas; duplicar su árbol de campos sería peor que el problema que resuelve.

**Decisión que hay que respetar y que parece contradecir al spec:** el spec dice que «la etapa queda libre». Eso vale para el **tablero**, donde se arrastra con `moverEtapaCotizacion`. **Dentro del editor el select de etapa también se deshabilita**, porque la etapa del editor viaja en el payload de `guardarCotizacion` y sin botón de Guardar no hay forma de persistirla: un control activo que no puede guardar nada es peor que uno deshabilitado.

`numeroDocumento` y `TIPO_DOCUMENTO_LABEL` viven en `lib/pos/documentos.ts` y tienen esta forma:

```ts
export type TipoDocumento = 'factura' | 'comprobante' | 'nota_credito' | 'devolucion'
export const TIPO_DOCUMENTO_LABEL: Record<TipoDocumento, string>
export function numeroDocumento(f: {
  tipo: TipoDocumento
  correlativo: string | null
  numero_comprobante: number | null
}): string
```

- [ ] **Step 1: Cargar el documento enlazado en `page.tsx`**

En `app/admin/cotizaciones/[id]/page.tsx`, después de la línea `if (id !== 'nueva' && (!cot || !cot.ok)) notFound()`, añade:

```ts
  // D3: si la cotización ya fue facturada, se trae lo mínimo del documento
  // para que el badge "Facturada" pueda enlazar a él con su número real
  // (numeroDocumento cubre los cuatro tipos desde D1). Solo cuatro columnas:
  // el editor no necesita nada más del documento.
  const documentoId = cot && cot.ok && cot.data ? cot.data.documento_id : null
  const { data: documentoRow } = documentoId
    ? await supabase
        .from('documentos')
        .select('id, tipo, correlativo, numero_comprobante')
        .eq('id', documentoId)
        .maybeSingle()
    : { data: null }
```

Y pasa la prop nueva al editor:

```tsx
    <CotizacionEditor
      cotizacion={cot && cot.ok && cot.data ? cot.data : null}
      documento={documentoRow as DocumentoEnlace | null}
      productos={(productos ?? []) as unknown as Producto[]}
      clientes={(clientes ?? []) as unknown as Cliente[]}
      vendedores={(vendedores ?? []) as unknown as Vendedor[]}
      etapas={(etapas ?? []) as unknown as CotizacionEtapa[]}
      config={toConfigMap(config ?? [])}
    />
```

Añade el import del tipo al principio del archivo, junto a los otros:

```ts
import type { DocumentoEnlace } from './CotizacionEditor'
```

- [ ] **Step 2: Declarar el tipo y la variable de bloqueo en el editor**

En `app/admin/cotizaciones/[id]/CotizacionEditor.tsx`:

Añade a los imports (junto a los demás de `lib/`):

```ts
import { puedeEditarCotizacion } from '@/lib/cotizaciones/cotizaciones'
import { numeroDocumento, TIPO_DOCUMENTO_LABEL } from '@/lib/pos/documentos'
import type { TipoDocumento } from '@/lib/pos/documentos'
```

Justo antes de la declaración de `interface Props` (o donde estén los tipos del archivo), exporta:

```ts
// D3: lo mínimo del documento que produjo esta cotización, para que el badge
// "Facturada" enlace a él con su número real. Lo carga page.tsx.
export interface DocumentoEnlace {
  id: string
  tipo: TipoDocumento
  correlativo: string | null
  numero_comprobante: number | null
}
```

Añade `documento: DocumentoEnlace | null` a `Props` y desestructúralo en el componente junto a `cotizacion`.

Junto a `const documentoId = cotizacion?.documento_id ?? null` (línea 147) añade:

```ts
  // D3 — UNA sola variable gobierna el modo lectura. Todo campo, botón y
  // acción de escritura la consulta; no hay una segunda versión del
  // formulario. La regla es la misma que aplican las Server Actions
  // (puedeEditarCotizacion), así que pantalla y servidor no pueden divergir.
  const bloqueada = !puedeEditarCotizacion(documentoId)
```

- [ ] **Step 3: Aplicar el bloqueo a los campos y acciones**

Aplica `bloqueada` en estos puntos concretos. **Deshabilitar (`disabled={bloqueada}`)**, no ocultar, salvo donde se indique ocultar:

| Qué | Dónde (línea aproximada hoy) | Cómo |
|---|---|---|
| Toda la columna de catálogo | `<section className={styles.catalogoCol}>`, línea 512 | **Ocultar**: `{!bloqueada && ( … )}` alrededor de la `<section>` entera. Sin catálogo no hay forma de agregar líneas, y ocupar media pantalla con un buscador inerte es peor que quitarlo. |
| Input de búsqueda del catálogo | línea 516 | Queda dentro de lo ocultado. |
| Input de cliente | `styles.clienteInput`, línea 598 | `disabled={bloqueada}` |
| Botón «+ Nuevo» cliente | `styles.btnNuevoCliente`, línea 593 | **Ocultar**: `{!bloqueada && ( … )}` |
| Botones − y + de cantidad | `btnMerlinIcon`, líneas 651 y 667 | `disabled={bloqueada}` |
| Input de cantidad | `styles.qtyInput`, línea 659 | `disabled={bloqueada}` |
| Botón editar línea (✎) | `styles.btnEditarLinea`, línea 678 | **Ocultar**: `{!bloqueada && ( … )}` |
| Botón quitar línea (×) | `btnMerlinIconDanger`, línea 686 | **Ocultar**: `{!bloqueada && ( … )}` |
| Input de descuento global | `styles.descuentoGlobalInput`, línea 709 | `disabled={bloqueada}` |
| Select de etapa | línea 759 | `disabled={bloqueada}` — ver la decisión explicada arriba |
| Select de vendedor | línea 767 | `disabled={bloqueada}` |
| Input de validez | línea 776 | `disabled={bloqueada}` |
| Textarea de condiciones | línea 792 | `disabled={bloqueada}` |
| Textarea de notas | línea 796 | `disabled={bloqueada}` |

Si el bloque de líneas queda vacío estando bloqueada, el texto actual (`'Agrega productos desde el catálogo o un ítem libre.'`, línea 638) invita a algo imposible. Cámbialo por una condicional:

```tsx
              <div className={styles.empty}>
                {bloqueada
                  ? 'Esta cotización no tiene líneas.'
                  : 'Agrega productos desde el catálogo o un ítem libre.'}
              </div>
```

- [ ] **Step 4: Sustituir Guardar por el aviso, y convertir el badge en enlace**

En la cabecera (líneas 455-505):

El badge de hoy es:

```tsx
            {documentoId && <span className={styles.badgeFacturada}>Facturada</span>}
```

Déjalo así:

```tsx
            {/* D3: el badge deja de ser decorativo — enlaza al documento que
                produjo la cotización, rotulado con numeroDocumento, que cubre
                los cuatro tipos (D1). Si por lo que sea no se pudo cargar el
                documento, se conserva el badge sin enlace: un enlace que no
                lleva a ninguna parte es peor que texto plano. */}
            {documentoId && (
              documento
                ? (
                  <Link href={`/admin/pos/documento/${documento.id}`} className={styles.badgeFacturadaLink}>
                    {TIPO_DOCUMENTO_LABEL[documento.tipo]} {numeroDocumento(documento)}
                  </Link>
                )
                : <span className={styles.badgeFacturada}>Facturada</span>
            )}
```

Añade `import Link from 'next/link'` a los imports del archivo.

El botón de Guardar de hoy es:

```tsx
          <button
            type="button"
            className={`btnMerlinPrimary ${styles.btnAccion}`}
            disabled={!puedeGuardar}
            onClick={handleGuardar}
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
```

Déjalo así:

```tsx
          {/* D3: en una cotización facturada Guardar DESAPARECE y en su lugar
              va la explicación. Un botón deshabilitado sin decir por qué deja
              al usuario adivinando; aquí además existe una salida concreta
              (Duplicar, el botón de al lado) y hay que nombrarla. */}
          {bloqueada ? (
            <span className={styles.avisoBloqueada}>
              Facturada: no se puede modificar. Usa Duplicar para trabajar sobre una copia.
            </span>
          ) : (
            <button
              type="button"
              className={`btnMerlinPrimary ${styles.btnAccion}`}
              disabled={!puedeGuardar}
              onClick={handleGuardar}
            >
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          )}
```

Ver PDF y Duplicar se quedan como están: sus condiciones actuales (`puedePdf`, `puedeDuplicar`) ya son correctas para una cotización facturada.

- [ ] **Step 5: Estilos del aviso y del badge-enlace**

Añade a `app/admin/cotizaciones/[id]/editor.module.css`, junto a `.badgeFacturada` (línea 38):

```css
/* D3: el badge "Facturada" pasa a ser enlace al documento. Hereda la caja del
   badge (composes va primero, es obligatorio en un CSS Module) y añade el
   color de enlace y el subrayado al pasar por encima, igual que .numeroLink
   del CSS compartido de fichas. */
.badgeFacturadaLink {
  composes: badge badgeOk from '../../tabla-admin.module.css';
  margin-top: 0.15rem;
  text-decoration: none;
  cursor: pointer;
}
.badgeFacturadaLink:hover { text-decoration: underline; }

/* Aviso que sustituye a Guardar en una cotización facturada. Texto, no caja
   de botón, para que no se lea como una acción disponible. */
.avisoBloqueada {
  font-size: 0.78rem;
  font-style: italic;
  color: var(--text-muted);
  max-width: 22rem;
}
```

- [ ] **Step 6: Ocultar Eliminar en la tarjeta facturada del tablero**

En `app/admin/cotizaciones/KanbanBoard.tsx`, la variable `facturada` ya existe (línea 198: `const facturada = c.documento_id !== null`). El botón de Eliminar está en las líneas 241-246:

```tsx
                              <button
                                className={`${styles.menuItem} ${styles.menuItemDanger}`}
                                onClick={() => eliminar(c.id, c.numero)}
                              >
                                Eliminar
                              </button>
```

Déjalo así:

```tsx
                              {/* D3: una cotización facturada no se borra (la
                                  acción lo rechaza en el servidor); ofrecer el
                                  botón solo para que falle es peor que no
                                  ofrecerlo. Duplicar sí se queda: es la salida. */}
                              {!facturada && (
                                <button
                                  className={`${styles.menuItem} ${styles.menuItemDanger}`}
                                  onClick={() => eliminar(c.id, c.numero)}
                                >
                                  Eliminar
                                </button>
                              )}
```

**No toques el arrastre.** `draggable` (línea 203), `onDragStart` (204) y `onDrop` (184) se quedan igual: la etapa queda fuera del bloqueo y la tarjeta facturada se sigue moviendo.

- [ ] **Step 7: Verificación completa**

Run: `npx tsc --noEmit` — Expected: sin salida.
Run: `npm test` — Expected: 46 archivos, 645 tests.
Run: `npx eslint app/admin/cotizaciones` — Expected: sin errores.
Run: `npm run build` — Expected: build correcto.

- [ ] **Step 8: Comprobaciones funcionales**

Si no logras autenticarte en `/admin`, **dilo en el informe y no las des por hechas**. No inventes credenciales.

1. Abrir una cotización **sin facturar**: se edita y se guarda igual que antes. El catálogo está visible.
2. Abrir una cotización **facturada**: el catálogo no aparece, ningún campo se deja escribir, no hay botones de quitar ni editar línea, no hay Guardar y sí el aviso.
3. El badge enlaza y lleva al documento correcto, con su número real (una factura debe mostrar su correlativo, no `C-00000000`).
4. **Duplicar una cotización facturada**: crea una copia editable y sin `documento_id`.
5. **Arrastrar la tarjeta facturada** en el tablero: sigue funcionando.
6. En el menú de la tarjeta facturada **no está Eliminar**; en una sin facturar sí.

- [ ] **Step 9: Commit**

```bash
git add app/admin/cotizaciones
git commit -m "feat(cotizaciones): modo lectura y badge-enlace en cotizacion facturada (D3)"
```

---

## Task 4: `importeLineaCompra`, con el test que ata el desglose al total

**Files:**
- Modify: `lib/compras/compras.ts`
- Test: `lib/compras/tests/compras.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `importeLineaCompra(item: { cantidad_ordenada: number; costo_unitario: number }, moneda: CompraMoneda, tasa: number | null): number` — exportada desde `lib/compras/compras.ts`. La consume la Task 6.

**Lo más importante de esta tarea, y la razón de que exista:** `totalCompra` redondea **la suma una sola vez, al final**:

```ts
export function totalCompra(items, moneda, tasa): number {
  const factor = moneda === 'USD' ? (tasa ?? 0) : 1
  return round2(items.reduce((s, i) => s + i.cantidad_ordenada * i.costo_unitario * factor, 0))
}
```

Por eso **`importeLineaCompra` NO redondea**. Si redondeara cada línea, la suma de las líneas dejaría de coincidir con el total en cuanto hubiera terceros decimales, y el desglose contradiría a la fila de CxP por céntimos — justo lo que esta mitad viene a evitar. El redondeo es de presentación y lo hace `formatPrice()` al pintar.

`round2` ya existe en el archivo pero **no está exportada**; el test la reimplementa en una línea.

- [ ] **Step 1: Escribir el test que falla**

Añade al final de `lib/compras/tests/compras.test.ts`:

```ts
describe('importeLineaCompra', () => {
  it('en L. es cantidad × costo', () => {
    expect(importeLineaCompra({ cantidad_ordenada: 3, costo_unitario: 50 }, 'L', null)).toBe(150)
  })

  it('en USD convierte con la tasa', () => {
    expect(importeLineaCompra({ cantidad_ordenada: 2, costo_unitario: 10 }, 'USD', 26.3)).toBe(526)
  })

  // NO redondea a propósito: totalCompra redondea la suma UNA sola vez, al
  // final. Si esta función redondeara por línea, la suma de las líneas
  // dejaría de dar el total y el desglose de CxP contradiría a su fila.
  it('no redondea: devuelve el producto crudo', () => {
    expect(importeLineaCompra({ cantidad_ordenada: 3, costo_unitario: 0.335 }, 'L', null))
      .toBeCloseTo(1.005, 10)
  })

  it('USD sin tasa vale cero, igual que totalCompra', () => {
    expect(importeLineaCompra({ cantidad_ordenada: 5, costo_unitario: 10 }, 'USD', null)).toBe(0)
  })
})

// Esta es la afirmación que protege la pantalla: el desglose que ve el
// usuario en Cuentas por pagar tiene que sumar exactamente el total de la
// fila de arriba. Si algún día alguien "arregla" importeLineaCompra
// redondeando por línea, este test es el que lo detiene.
describe('el desglose por línea reconcilia con totalCompra', () => {
  const round2 = (n: number) => Math.round(n * 100) / 100
  const sumaLineas = (items: { cantidad_ordenada: number; costo_unitario: number }[], moneda: 'L' | 'USD', tasa: number | null) =>
    round2(items.reduce((s, i) => s + importeLineaCompra(i, moneda, tasa), 0))

  it('cuadra en Lempiras', () => {
    const items = [
      { cantidad_ordenada: 2, costo_unitario: 100 },
      { cantidad_ordenada: 3, costo_unitario: 50 },
    ]
    expect(sumaLineas(items, 'L', null)).toBe(totalCompra(items, 'L', null))
  })

  it('cuadra en dólares con tasa', () => {
    const items = [
      { cantidad_ordenada: 2, costo_unitario: 10 },
      { cantidad_ordenada: 7, costo_unitario: 3.5 },
    ]
    expect(sumaLineas(items, 'USD', 26.3)).toBe(totalCompra(items, 'USD', 26.3))
  })

  // El caso que rompería un redondeo por línea: tres líneas cuyo importe
  // individual cae en el tercer decimal. Redondeando cada una daría 3.02
  // (1.01 × 3) contra un total real de 3.015 → 3.02… o 3.01 según el reparto.
  // Con la función sin redondear, ambos lados son idénticos por construcción.
  it('cuadra con terceros decimales, que es donde falla el redondeo por línea', () => {
    const items = [
      { cantidad_ordenada: 3, costo_unitario: 0.335 },
      { cantidad_ordenada: 3, costo_unitario: 0.335 },
      { cantidad_ordenada: 3, costo_unitario: 0.335 },
    ]
    expect(sumaLineas(items, 'L', null)).toBe(totalCompra(items, 'L', null))
  })
})
```

Añade `importeLineaCompra` a la lista de imports de la primera línea del archivo, que hoy es:

```ts
import { numeroCompra, costoEnLempiras, totalCompra, estadoCompra, cantidadSugeridaReorden } from '../compras'
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/compras/tests/compras.test.ts`
Expected: FAIL — `importeLineaCompra is not a function`.

- [ ] **Step 3: Implementar**

Añade a `lib/compras/compras.ts`, justo después de `totalCompra`:

```ts
/**
 * Importe en Lempiras de una línea de compra: cantidad ordenada × costo
 * unitario, convertido si la compra es en dólares.
 *
 * **No redondea, y es a propósito.** `totalCompra` redondea la suma UNA sola
 * vez, al final. Si aquí se redondeara por línea, la suma de las líneas
 * dejaría de dar el total en cuanto hubiera terceros decimales, y el desglose
 * de Cuentas por pagar contradiría por céntimos a la fila que está justo
 * encima. El redondeo es de presentación: lo hace `formatPrice()` al pintar.
 * El test de reconciliación en tests/compras.test.ts fija este contrato.
 *
 * Se usa `cantidad_ordenada`, no `cantidad_recibida`: lo que se debe es lo
 * ordenado. La recibida se muestra como dato aparte, porque la diferencia
 * entre ambas es justo lo que se quiere ver antes de pagar.
 */
export function importeLineaCompra(
  item: { cantidad_ordenada: number; costo_unitario: number },
  moneda: CompraMoneda,
  tasa: number | null,
): number {
  const factor = moneda === 'USD' ? (tasa ?? 0) : 1
  return item.cantidad_ordenada * item.costo_unitario * factor
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run lib/compras/tests/compras.test.ts`
Expected: PASS — todos los tests del archivo.

- [ ] **Step 5: Verificación completa**

Run: `npx tsc --noEmit` — Expected: sin salida.
Run: `npm test` — Expected: 46 archivos, 652 tests (645 tras la Task 1 + 7 nuevos).
Run: `npx eslint lib/compras` — Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add lib/compras/compras.ts lib/compras/tests/compras.test.ts
git commit -m "feat(compras): importeLineaCompra con test de reconciliacion contra totalCompra (D3)"
```

---

## Task 5: El Server Action que trae los ítems de una compra

**Files:**
- Modify: `app/admin/cuentas-por-pagar/actions.ts`

**Interfaces:**
- Consumes: `hayTruncamiento(filasRecibidas: number, total: number | null): boolean` y `sinConteo(total: number | null): boolean` de `lib/pos/truncamiento.ts`.
- Produces:

```ts
export interface ItemsCompra {
  moneda: CompraMoneda
  tasa: number | null
  items: CompraItem[]
}
export async function obtenerItemsCompra(compraId: string): Promise<CxpResult<ItemsCompra>>
```

La consume la Task 6.

**Dos cosas que hay que saber:**

1. **La vista `compra_saldos` NO trae `moneda` ni `tasa_cambio`.** Están en la tabla `compras`. Sin ellas no se puede convertir el costo a Lempiras, así que este action lee las dos cosas: la cabecera de `compras` y las líneas de `compra_items`.
2. **La consulta de ítems lleva `.limit()` explícito y verificación de conteo.** Sin eso PostgREST puede truncar en silencio, y un desglose incompleto con apariencia de completo, en la pantalla donde se decide cuánto pagar, es el mismo fallo que la ola del cierre de caja tuvo que cerrar. El patrón exacto ya está en `app/admin/pos/actions.ts:212-232`.

`CompraItem` ya existe en `types/index.ts` con esta forma:

```ts
export interface CompraItem {
  id: string
  compra_id: string
  producto_id: string
  variante_id: string | null
  descripcion: string
  cantidad_ordenada: number
  cantidad_recibida: number
  costo_unitario: number
  orden: number
}
```

- [ ] **Step 1: Añadir los imports**

En `app/admin/cuentas-por-pagar/actions.ts`, añade tras los imports existentes:

```ts
import { hayTruncamiento, sinConteo } from '@/lib/pos/truncamiento'
```

Y añade `CompraItem` y `CompraMoneda` a la lista de tipos importados de `@/types`, que hoy es:

```ts
import type { CompraSaldo, CxpFila, PagoProveedor, PagoAplicacion, PagoMetodo } from '@/types'
```

- [ ] **Step 2: Escribir el action**

Añade al final del archivo:

```ts
// D3: qué contiene una compra, para el desglose de Cuentas por pagar.
// La moneda y la tasa NO están en la vista compra_saldos (solo en la tabla
// compras) y sin ellas no se puede convertir el costo a Lempiras, así que se
// leen aquí junto a las líneas.
export interface ItemsCompra {
  moneda: CompraMoneda
  tasa: number | null
  items: CompraItem[]
}

// Tope de líneas por compra. Es holgado respecto a cualquier compra real; su
// función es que un desbordamiento se detecte y se diga, no que se recorte en
// silencio.
const LIMITE_ITEMS_COMPRA = 500

export async function obtenerItemsCompra(compraId: string): Promise<CxpResult<ItemsCompra>> {
  const supabase = await createClient()

  const { data: compra, error: compraErr } = await supabase
    .from('compras')
    .select('moneda, tasa_cambio')
    .eq('id', compraId)
    .maybeSingle()
  if (compraErr) return { ok: false, error: ERROR_GENERICO }
  if (!compra) return { ok: false, error: 'No se encontró la compra.' }

  const { data: rows, error: itemsErr, count } = await supabase
    .from('compra_items')
    .select('*', { count: 'exact' })
    .eq('compra_id', compraId)
    .order('orden')
    .limit(LIMITE_ITEMS_COMPRA)
  if (itemsErr) return { ok: false, error: ERROR_GENERICO }

  // Sin conteo la guarda de abajo no puede decidir nada: se deja constancia
  // en vez de fingir que se verificó.
  if (sinConteo(count)) {
    console.warn(`guarda de truncamiento inerte: sin conteo al leer items de la compra ${compraId}`)
  }

  // Con truncamiento se prefiere no mostrar nada antes que mostrar un
  // desglose incompleto que parece completo: el usuario está decidiendo un
  // pago contra esta lista.
  if (hayTruncamiento((rows ?? []).length, count)) {
    console.error(
      `obtenerItemsCompra: truncamiento al leer items de la compra ${compraId} ` +
        `(${(rows ?? []).length} de ${count})`,
    )
    return {
      ok: false,
      error: 'La compra tiene más líneas de las que se pueden mostrar. Ábrela desde Compras para verlas todas.',
    }
  }

  return {
    ok: true,
    data: {
      moneda: compra.moneda as CompraMoneda,
      tasa: compra.tasa_cambio as number | null,
      items: (rows ?? []) as unknown as CompraItem[],
    },
  }
}
```

- [ ] **Step 3: Verificación completa**

Run: `npx tsc --noEmit` — Expected: sin salida.
Run: `npm test` — Expected: 46 archivos, 652 tests (sin cambio respecto a la Task 4).
Run: `npx eslint app/admin/cuentas-por-pagar` — Expected: sin errores.
Run: `npm run build` — Expected: build correcto.

- [ ] **Step 4: Commit**

```bash
git add app/admin/cuentas-por-pagar/actions.ts
git commit -m "feat(cxp): action para leer los items de una compra con guarda de truncamiento (D3)"
```

---

## Task 6: Enlace y fila desplegable en Cuentas por pagar

**Files:**
- Modify: `app/admin/cuentas-por-pagar/CuentasPorPagarClient.tsx` (192 líneas)
- Modify: `app/admin/cuentas-por-pagar/cxp.module.css`

**Interfaces:**
- Consumes: `obtenerItemsCompra(compraId: string): Promise<CxpResult<ItemsCompra>>` y el tipo `ItemsCompra` (Task 5); `importeLineaCompra(item, moneda, tasa): number` (Task 4).
- Produces: nada.

**Contexto de la tabla que vas a tocar.** Hoy tiene siete columnas (`Número`, `Proveedor`, total, pagado, saldo, `Vencimiento`, `Estado`) más una de acción, y **ningún enlace**. Cada fila se pinta con `key={f.compra_id}`, así que el id ya está a mano. La tabla usa `styles.table`, que compone de `tabla-admin.module.css`.

**Tres trampas concretas de este repo:**

- Una fila desplegable se pinta con un segundo `<tr>` **hermano**, no anidado. Como el `<tbody>` tendría dos elementos por fila, hay que envolverlos en un `<Fragment key={...}>` (importado de `react`), no en un `<div>`: un `<div>` dentro de `<tbody>` es HTML inválido y React lo reporta como error de hidratación.
- El `<td>` de la fila desplegada lleva `colSpan={9}` — **nueve**: la tabla tiene hoy ocho columnas (`Número`, `Proveedor`, `Total`, `Pagado`, `Saldo`, `Vencimiento`, `Estado` y la de acciones) y el Step 2 añade una novena para el botón de desplegar. Si el `colSpan` se queda corto, la fila del desglose no abarca el ancho y la tabla se desalinea.
- Si le das color propio a algún `<td>` del desglose, la clase sobre el `<td>` **pierde** contra la regla `td` de la tabla: hay que escribir `.table td.miClase`.

- [ ] **Step 1: Imports y estado**

Añade a los imports de `CuentasPorPagarClient.tsx`:

```ts
import { Fragment } from 'react'
import Link from 'next/link'
import { importeLineaCompra } from '@/lib/compras/compras'
import { obtenerItemsCompra } from './actions'
import type { ItemsCompra } from './actions'
```

Y dentro del componente, junto a los otros `useState`:

```ts
  // D3 — desglose de ítems por compra. `abierta` es la fila desplegada (una a
  // la vez: dos desgloses abiertos a la vez alargan la tabla sin ayudar a
  // comparar). `cache` guarda lo ya traído por compra_id, para que plegar y
  // volver a desplegar no repita la consulta.
  const [abierta, setAbierta] = useState<string | null>(null)
  const [cache, setCache] = useState<Record<string, ItemsCompra>>({})
  const [cargandoItems, setCargandoItems] = useState<string | null>(null)
  const [errorItems, setErrorItems] = useState<Record<string, string>>({})

  async function alternarDetalle(compraId: string) {
    if (abierta === compraId) {
      setAbierta(null)
      return
    }
    setAbierta(compraId)
    if (cache[compraId]) return
    setCargandoItems(compraId)
    const res = await obtenerItemsCompra(compraId)
    setCargandoItems(null)
    if (res.ok && res.data) {
      setCache(c => ({ ...c, [compraId]: res.data! }))
      setErrorItems(e => {
        const { [compraId]: _quitado, ...resto } = e
        return resto
      })
    } else {
      setErrorItems(e => ({ ...e, [compraId]: res.ok ? 'No se pudo cargar el detalle.' : res.error }))
    }
  }
```

- [ ] **Step 2: Añadir la columna de despliegue a la cabecera**

La cabecera de hoy (líneas 132-139) es:

```tsx
              <th>Número</th>
              <th>Proveedor</th>
```

Añade una columna vacía **antes** de `Número`, para el botón de desplegar:

```tsx
              <th className={styles.colDetalle}></th>
              <th>Número</th>
              <th>Proveedor</th>
```

La tabla pasa de 8 a 9 columnas. **El `colSpan` del Step 4 es 9.**

- [ ] **Step 3: Enlazar el número y añadir el botón de desplegar**

La fila de hoy (líneas 144-145) empieza así:

```tsx
              <tr key={f.compra_id}>
                <td className={styles.numero}>{f.numero}</td>
```

Reemplaza la apertura de la fila y su primera celda por:

```tsx
              <Fragment key={f.compra_id}>
              <tr>
                <td className={styles.colDetalle}>
                  <button
                    type="button"
                    className={styles.btnDetalle}
                    onClick={() => alternarDetalle(f.compra_id)}
                    aria-expanded={abierta === f.compra_id}
                    aria-label={abierta === f.compra_id ? 'Ocultar detalle' : 'Ver detalle'}
                  >
                    {abierta === f.compra_id ? '▾' : '▸'}
                  </button>
                </td>
                {/* D3: CxP no tenía un solo enlace. compra_id ya venía en la
                    fila; el detalle de compra ya existe. */}
                <td className={styles.numero}>
                  <Link href={`/admin/compras/${f.compra_id}`} className={styles.numeroLink}>
                    {f.numero}
                  </Link>
                </td>
```

Y cierra el `Fragment` justo después del `</tr>` de la fila (antes lo cerraba el `))}`), tras insertar la fila del Step 4.

- [ ] **Step 4: La fila del desglose**

Inmediatamente después del `</tr>` de la fila normal, y antes de cerrar el `Fragment`:

```tsx
              {abierta === f.compra_id && (
                <tr className={styles.filaDetalle}>
                  <td colSpan={9}>
                    {cargandoItems === f.compra_id && <div className={styles.detalleEstado}>Cargando detalle…</div>}
                    {errorItems[f.compra_id] && <div className={styles.detalleError}>{errorItems[f.compra_id]}</div>}
                    {cache[f.compra_id] && (
                      cache[f.compra_id].items.length === 0 ? (
                        <div className={styles.detalleEstado}>Esta compra no tiene líneas.</div>
                      ) : (
                        <>
                          {/* Una compra en dólares guarda el costo en USD y el
                              total en Lempiras. Si la tasa falta, costoEnLempiras
                              y totalCompra valen cero los dos: fila y desglose
                              coinciden, pero en cero. Se dice, en vez de dejar
                              una compra real presentada como si no valiera nada. */}
                          {cache[f.compra_id].moneda === 'USD' && (
                            <div className={styles.detalleNota}>
                              {cache[f.compra_id].tasa != null
                                ? `Compra en dólares · tasa L. ${cache[f.compra_id].tasa!.toFixed(2)} por US$1.00`
                                : 'Compra en dólares sin tasa de cambio registrada: los importes no se pueden convertir.'}
                            </div>
                          )}
                          <table className={styles.tablaDetalle}>
                            <thead>
                              <tr>
                                <th>Descripción</th>
                                <th>Ordenada</th>
                                <th>Recibida</th>
                                <th>Costo unitario</th>
                                <th>Importe</th>
                              </tr>
                            </thead>
                            <tbody>
                              {cache[f.compra_id].items.map(it => (
                                <tr key={it.id}>
                                  <td>{it.descripcion}</td>
                                  <td className={styles.num}>{it.cantidad_ordenada}</td>
                                  <td className={styles.num}>{it.cantidad_recibida}</td>
                                  <td className={styles.num}>
                                    {cache[f.compra_id].moneda === 'USD'
                                      ? `US$ ${it.costo_unitario.toFixed(2)}`
                                      : formatPrice(it.costo_unitario)}
                                  </td>
                                  <td className={styles.num}>
                                    {formatPrice(
                                      importeLineaCompra(it, cache[f.compra_id].moneda, cache[f.compra_id].tasa),
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </>
                      )
                    )}
                  </td>
                </tr>
              )}
              </Fragment>
```

**No escribas ninguna multiplicación aquí.** El importe sale de `importeLineaCompra`; es la única forma de garantizar que la suma de las líneas cuadre con el total de la fila de arriba, que es lo que fija el test de la Task 4.

- [ ] **Step 5: Estilos**

Añade a `app/admin/cuentas-por-pagar/cxp.module.css`:

```css
/* ---- D3: desglose de ítems por compra ---- */

/* El número de compra pasa a ser enlace al detalle. Mismo tratamiento que
   .numeroLink del CSS compartido de fichas (D1/D2). */
.numeroLink { font-weight: 700; color: var(--accent); text-decoration: none; }
.numeroLink:hover { text-decoration: underline; }

.colDetalle { width: 2rem; }

/* Botón de desplegar: las clases btnMerlin* no traen padding ni display, así
   que este control define su propia caja. */
.btnDetalle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.6rem;
  height: 1.6rem;
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 0.8rem;
  cursor: pointer;
}
.btnDetalle:hover { color: var(--text); }

.filaDetalle > td { background: var(--bg-hover); padding: 0.85rem 1rem; }

.detalleEstado { font-size: 0.82rem; color: var(--text-muted); }
.detalleError { font-size: 0.82rem; color: var(--danger); }
.detalleNota { font-size: 0.78rem; color: var(--text-muted); margin-bottom: 0.5rem; }

.tablaDetalle { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
.tablaDetalle th {
  text-align: left;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-muted);
  padding: 0.3rem 0.5rem;
  border-bottom: 1px solid var(--border-light);
}
.tablaDetalle td {
  padding: 0.35rem 0.5rem;
  border-bottom: 1px solid var(--border-light);
  color: var(--text);
}
.tablaDetalle tr:last-child td { border-bottom: none; }
/* `.num` ya existe arriba, pero dentro de .tablaDetalle la regla `td` de esta
   misma tabla le ganaría en especificidad si solo se usara la clase. */
.tablaDetalle td.num { text-align: right; white-space: nowrap; }
```

- [ ] **Step 6: Verificación completa**

Run: `npx tsc --noEmit` — Expected: sin salida.
Run: `npm test` — Expected: 46 archivos, 652 tests.
Run: `npx eslint app/admin/cuentas-por-pagar` — Expected: sin errores.
Run: `npm run build` — Expected: build correcto.

- [ ] **Step 7: Comprobaciones funcionales**

Si no logras autenticarte en `/admin`, **dilo en el informe y no las des por hechas**.

1. En `/admin/cuentas-por-pagar`, el número de compra enlaza y lleva al detalle correcto.
2. El botón despliega la fila y muestra los ítems; volver a pulsarlo la pliega.
3. **La suma de la columna Importe coincide con el total de la fila de arriba**, en una compra en Lempiras.
4. Lo mismo en una compra en dólares, donde además debe verse la nota con la tasa y el costo unitario en US$.
5. Plegar y volver a desplegar **no** vuelve a consultar (el detalle aparece al instante).
6. Los filtros de proveedor y estado siguen funcionando con una fila desplegada.
7. No hay errores de hidratación en la consola del navegador (es lo que delataría un `<div>` mal puesto dentro del `<tbody>`).

- [ ] **Step 8: Commit**

```bash
git add app/admin/cuentas-por-pagar
git commit -m "feat(cxp): enlace a la compra y desglose de items por fila (D3)"
```

---

## Autorrevisión

**1. Cobertura del spec**

| Requisito del spec | Tarea |
|---|---|
| Congelar líneas, precios, descuento, cliente, vendedor, validez, condiciones, notas | 3 |
| Etapa fuera del bloqueo (arrastre en el tablero) | 2 (`moverEtapaCotizacion` sin guarda), 3 (arrastre intacto) |
| Guarda en `guardarCotizacion` releyendo de la BD | 2 |
| Guarda en `eliminarCotizacion` | 2 |
| `duplicarCotizacion` intacta como vía de escape | 2 (Step 4) |
| `puedeEditarCotizacion` en `lib/` con test | 1 |
| Guardar desaparece + leyenda que ofrece Duplicar | 3 (Step 4) |
| Badge «Facturada» como enlace al documento | 3 (Steps 1, 4) |
| Tarjeta facturada sin Eliminar | 3 (Step 6) |
| Enlace del número de compra a `/admin/compras/[id]` | 6 (Step 3) |
| Fila desplegable con ítems, carga bajo demanda y caché | 6 (Steps 1, 4) |
| `.limit()` + verificación de conteo con `hayTruncamiento` | 5 |
| `importeLineaCompra` sin redondear, con test de reconciliación | 4 |
| `cantidad_ordenada` para el importe, `cantidad_recibida` como dato | 4 (docstring), 6 (columnas) |
| USD: costo en US$, tasa y importe en Lempiras | 6 (Step 4) |
| USD sin tasa: se dice | 6 (Step 4) |
| Sin migraciones | Global Constraints |

Sin huecos.

**2. Marcadores de relleno:** ninguno. Todos los pasos de código llevan el código.

**3. Consistencia de tipos entre tareas**

- `puedeEditarCotizacion(documentoId: string | null): boolean` — Task 1 la define; Tasks 2 y 3 la consumen con esa firma.
- `importeLineaCompra(item, moneda, tasa): number` — Task 4 la define; Task 6 la llama con `(it, moneda, tasa)`, y `CompraItem` cumple el `{ cantidad_ordenada, costo_unitario }` que pide.
- `ItemsCompra { moneda, tasa, items }` y `obtenerItemsCompra` — Task 5 los define; Task 6 los consume con esos nombres exactos.
- `DocumentoEnlace` — Task 3 la exporta desde `CotizacionEditor.tsx` y la importa en `page.tsx`; sus cuatro campos son los que pide `numeroDocumento` más el `id` para el `href`.
- `ERROR_FACTURADA` — Task 2 lo define; ninguna tarea posterior lo importa (la Task 3 escribe su propio texto en la UI, que es lo correcto: uno es mensaje de error del servidor y el otro una leyenda permanente de pantalla).

**Corrección aplicada durante la autorrevisión:** el Step 2 de la Task 6 añade una columna a la cabecera, de modo que la tabla pasa de 8 a 9 columnas (verificado contra `CuentasPorPagarClient.tsx:132-139`: `Número`, `Proveedor`, `Total`, `Pagado`, `Saldo`, `Vencimiento`, `Estado` y la de acciones). El `colSpan` estaba escrito como 8 en el enunciado de las trampas y como 9 en el código; quedó **9** en los tres sitios.

**Segunda corrección:** la Task 3 deshabilita el select de etapa *dentro del editor* aunque el spec diga que «la etapa queda libre». No es una contradicción sino una precisión: la etapa del editor viaja en el payload de `guardarCotizacion`, y sin botón de Guardar no hay forma de persistirla. La libertad de la etapa se ejerce en el tablero, arrastrando, que es donde `moverEtapaCotizacion` la escribe. Está anotado en el enunciado de la Task 3 para que quien la implemente no lo lea como un error del plan.

**Nota para quien ejecute la ola:** las Tasks 1-3 (cotización) y 4-6 (CxP) son independientes y no comparten ningún archivo. Se pueden revisar por separado, pero **no se implementan en paralelo** en el mismo árbol de trabajo.
