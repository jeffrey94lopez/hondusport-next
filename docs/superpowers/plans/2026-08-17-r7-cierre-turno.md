# R7 — Cierre de turno: modo a ciegas configurable y comprobante desglosado — Plan de implementación

> **Para trabajadores agénticos:** SUB-SKILL REQUERIDA: usa superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan sintaxis de checkbox (`- [ ]`) para seguimiento.

**Goal:** Que el cierre de turno tenga un modo a ciegas que se pueda habilitar o deshabilitar, y que produzca un comprobante desglosado imprimible en tirilla de 80 mm.

**Architecture:** El interruptor es una clave más en la tabla clave/valor `configuracion`, leída con el criterio "ausente = valor por defecto" que ya usa `pos_documento_modal`, y **solo** decide qué se muestra antes de confirmar — el cálculo del arqueo y lo que se congela en `sesiones_caja` no cambian. El comprobante es un componente de presentación nuevo que recibe datos ya calculados; el desglose sale de `esperadoCaja()`, ampliada para devolver también el cambio entregado, que hoy resta sin exponer. La impresión reutiliza `.hoja80` y sus reglas `@media print`, ya usadas por los documentos.

**Tech Stack:** Next.js 16 (App Router, Server Components + Server Actions), React 19, TypeScript, Supabase (PostgREST), CSS Modules, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-17-r7-cierre-turno-design.md`

## Global Constraints

- **Sin migración.** `pos_cierre_ciegas` vive en `configuracion`, que es clave/valor, y se crea sola al guardarla por primera vez. Ninguna tarea escribe SQL.
- **El interruptor es de presentación.** No puede alterar `esperadoCaja`, `cerrarSesion`, ni lo que se persiste en `sesiones_caja` (`monto_esperado`, `monto_contado`, `diferencia`). Cerrar con el interruptor activo o inactivo debe congelar exactamente los mismos números.
- **El arqueo de un turno cerrado sale de los valores congelados** en `sesiones_caja`, nunca de un recálculo. `esperadoCaja()` se usa solo para el desglose, que no se persiste.
- **Dinero:** todo importe con `formatPrice()` de `@/lib/store/format`, 2 decimales, Lempiras `L.`. Ninguna suma de dinero escrita a mano en un componente.
- **Lógica con peso va a `lib/` como función pura con test** en `lib/<área>/tests/`.
- **Criterio "ausente = valor por defecto"** al leer la clave: `configuracion` puede no tenerla todavía. Para este interruptor el defecto es **a ciegas activo**, así que se lee como `config.pos_cierre_ciegas !== 'false'`.
- **Listados con `.limit()` explícito.** Sin él PostgREST aplica su tope por defecto y trunca en silencio.
- **Botones:** las clases globales `btnMerlinPrimary`/`Secondary`/`Tertiary` de `app/merlin.css` solo aportan color, radio y tipografía — **no traen padding ni display**. Todo botón debe combinarlas con una clase de layout del módulo (`.btn`, `.btnToolbar`, `.btnAccion`…). Sin ella se pinta como texto suelto: fue el bug reportado en R6.
- **Especificidad CSS:** `app/globals.css` tiene una regla global sobre `input[type=...]`, `textarea` y `select` con especificidad (0,1,1) que pisa una clase de módulo sola (0,1,0) — usa selector compuesto de dos clases. Y una clase aplicada directo sobre un `<td>` pierde contra la regla `td` de la propia tabla.
- **Hojas imprimibles:** fondo blanco y tinta fija a propósito (simulan papel, no siguen el tema de la app), igual que `.hoja80` de `app/admin/pos/documento/documento.module.css`.
- **Tokens Merlin**; no hardcodear valores que ya tienen token, salvo dentro de la hoja imprimible.
- **Idioma:** UI, dominio y mensajes de commit en español, formato convencional.
- Al cerrar cada tarea: `npx tsc --noEmit`, `npm test`, `npm run build`. Reportar resultados reales.
- **Entorno:** el repo está en OneDrive y bloquea archivos. `npm run build` puede fallar con `EPERM ... unlink '.next\...'`; si pasa, detén el servidor de desarrollo, `rm -rf .next` y reintenta. Si `npm test` reporta errores de *import* en vez de fallos de aserción, es el mismo bloqueo: vuelve a correrlo (la corrida buena da 126 archivos / 1713 tests). `npm run lint` completo excede el tiempo por ~24000 problemas preexistentes en `.claude/` y `coverage/`; corre `npx eslint` sobre los directorios que toques.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `lib/pos/emision.ts` | **Modificar** — `esperadoCaja` devuelve además `cambioEntregado`. |
| `lib/pos/tests/emision.test.ts` | **Modificar** — tests del campo nuevo. |
| `app/admin/configuracion/PosSection.tsx` | **Modificar** — interruptor `pos_cierre_ciegas`. |
| `app/admin/pos/actions.ts` | **Modificar** — `obtenerDetalleTurno(sesionId)`: créditos otorgados y cobros del turno. |
| `lib/pos/turnos.ts` | **Modificar** — tipos del comprobante y armado del detalle. |
| `lib/pos/tests/turnos.test.ts` | **Modificar** — tests del armado. |
| `components/pos/ComprobanteTurno.tsx` | **Crear** — el comprobante (presentación pura). |
| `components/pos/comprobante-turno.module.css` | **Crear** — estilos + `@media print` a 80 mm. |
| `app/admin/pos/components/CierreModal.tsx` | **Modificar** — respeta el interruptor; muestra el comprobante al cerrar. |
| `app/admin/pos/turnos/TurnosClient.tsx` | **Modificar** — respeta el interruptor; muestra el comprobante al cerrar. |
| `app/admin/pos/turnos/[id]/page.tsx` | **Modificar** — carga el detalle para el comprobante. |
| `app/admin/pos/turnos/[id]/TurnoDetalleView.tsx` | **Modificar** — botón de imprimir comprobante; retira la nota del cambio. |
| `app/admin/pos/page.tsx` · `app/admin/pos/turnos/page.tsx` | **Modificar** — leen la clave y la pasan al cliente. |

---

## Task 1: `esperadoCaja` devuelve el cambio entregado

**Files:**
- Modify: `lib/pos/emision.ts:84-141`
- Test: `lib/pos/tests/emision.test.ts`

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces: `esperadoCaja(...)` devuelve un campo más, `cambioEntregado: number`. La firma de entrada **no cambia**. Los tres consumidores actuales (`CierreModal`, `cerrarSesion`, `app/admin/pos/turnos/[id]/page.tsx`) siguen compilando sin tocarlos, porque solo se agrega una propiedad al objeto de retorno.

**Contexto:** hoy `esperadoCaja` calcula `cambio = cambioPago(doc.pagos, doc.total)` por documento y lo **resta** de `efectivoEsperado` (línea 123), pero no lo acumula ni lo devuelve. Por eso sumar el desglose nunca da el esperado, y en R6 hubo que poner una nota en pantalla para explicarlo. En una tirilla que alguien cuadra a mano la nota no alcanza: hace falta la línea.

- [ ] **Step 1: Escribir el test que falla**

Añade al final de `lib/pos/tests/emision.test.ts` (el archivo ya importa `esperadoCaja`; **extiende el import existente** si hiciera falta, no agregues uno segundo):

```ts
describe('esperadoCaja — cambio entregado', () => {
  // Venta de L. 500 pagada con L. 1000 en efectivo: entran 1000, salen 500 de
  // cambio. El efectivo esperado sube 500, pero porMetodo registra los 1000
  // cobrados. Sin exponer el cambio, sumar el desglose da 500 de mas.
  it('acumula el cambio de cada documento', () => {
    const r = esperadoCaja(0, [
      { estado: 'emitido', total: 500, pagos: [{ tipo: 'efectivo_lps', monto: 1000 }] },
    ])
    expect(r.cambioEntregado).toBe(500)
    expect(r.efectivoEsperado).toBe(500)
    expect(r.porMetodo.efectivo_lps).toBe(1000)
  })

  it('suma el cambio de varios documentos', () => {
    const r = esperadoCaja(0, [
      { estado: 'emitido', total: 500, pagos: [{ tipo: 'efectivo_lps', monto: 1000 }] },
      { estado: 'emitido', total: 250.5, pagos: [{ tipo: 'efectivo_lps', monto: 300 }] },
    ])
    expect(r.cambioEntregado).toBe(549.5)
  })

  it('sin cambio devuelve cero', () => {
    const r = esperadoCaja(100, [
      { estado: 'emitido', total: 500, pagos: [{ tipo: 'efectivo_lps', monto: 500 }] },
    ])
    expect(r.cambioEntregado).toBe(0)
  })

  // Misma regla que el resto de la funcion: un documento no emitido no cuenta.
  it('ignora los documentos que no estan emitidos', () => {
    const r = esperadoCaja(0, [
      { estado: 'anulado', total: 500, pagos: [{ tipo: 'efectivo_lps', monto: 1000 }] },
    ])
    expect(r.cambioEntregado).toBe(0)
  })

  // La identidad que el comprobante impreso debe permitir cuadrar a mano.
  it('inicial + efectivo cobrado - cambio = efectivo esperado', () => {
    const r = esperadoCaja(1000, [
      { estado: 'emitido', total: 500, pagos: [{ tipo: 'efectivo_lps', monto: 1000 }] },
    ])
    expect(round2(1000 + r.porMetodo.efectivo_lps - r.cambioEntregado)).toBe(r.efectivoEsperado)
  })
})
```

Si `round2` no está importado en ese archivo, impórtalo desde donde ya lo exponga el proyecto (`@/app/admin/pos/pos-helpers`).

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
npx vitest run lib/pos/tests/emision.test.ts
```
Esperado: FALLA — `cambioEntregado` es `undefined`.

- [ ] **Step 3: Implementar**

En `lib/pos/emision.ts`, agrega `cambioEntregado: number` al tipo de retorno (después de `efectivoEsperado`), declara el acumulador junto a `let efectivoEsperado = montoInicial`:

```ts
  let cambioEntregado = 0
```

dentro del bucle de documentos, donde ya se calcula `cambio`, acumula antes de restar:

```ts
    cambioEntregado = round2(cambioEntregado + cambio)
```

y añádelo al `return`:

```ts
  return { efectivoEsperado, cambioEntregado, porMetodo, cobrosPorMetodo, devolucionesPorMetodo }
```

Actualiza el comentario de bloque de la función (líneas 75-83) para mencionar que ahora también devuelve el cambio acumulado, y por qué: sin él el desglose no reconcilia con el esperado.

- [ ] **Step 4: Correr los tests**

```bash
npx vitest run lib/pos/tests/emision.test.ts
npm test
npx tsc --noEmit
```
Esperado: los 5 nuevos pasan; la suite completa verde; typecheck limpio (agregar una propiedad al retorno no rompe a los consumidores, que desestructuran solo lo que usan).

- [ ] **Step 5: Commit**

```bash
git add lib/pos/emision.ts lib/pos/tests/emision.test.ts
git commit -m "feat(pos): esperadoCaja devuelve el cambio entregado (R7)"
```

---

## Task 2: Interruptor de cierre a ciegas en Configuración

**Files:**
- Modify: `app/admin/configuracion/PosSection.tsx`

**Interfaces:**
- Consumes: `saveConfig({ clave: valor })` de las acciones de Configuración, ya usado por el interruptor de `pos_documento_modal` en ese mismo archivo.
- Produces: la clave `pos_cierre_ciegas` en `configuracion`, con valores `'true'` / `'false'`. **Se lee siempre como `config.pos_cierre_ciegas !== 'false'`** (ausente = a ciegas activo). Las tareas 4 y 5 la consumen.

- [ ] **Step 1: Añadir el interruptor**

En `app/admin/configuracion/PosSection.tsx` vive `DocumentoModalToggle` (alrededor de la línea 54), que es el patrón exacto a replicar: estado local, `startTransition`, `saveConfig`, y revertir el estado si la acción falla. Crea junto a él un `CierreCiegasToggle` con la misma forma, guardando `{ pos_cierre_ciegas: valor ? 'true' : 'false' }`, y móntalo en la sección con el resto de ajustes del POS.

Texto de la UI:

- Etiqueta: **Cierre de caja a ciegas**
- Descripción: **El cajero cuenta el efectivo sin ver antes cuánto se espera. El arqueo (esperado, contado y diferencia) se muestra siempre después de confirmar.**

Pásale el valor inicial desde donde el componente ya recibe la configuración, con el mismo criterio de "ausente = activo": `config.pos_cierre_ciegas !== 'false'`.

- [ ] **Step 2: Verificar**

```bash
npx tsc --noEmit
npm test
npm run build
```
Esperado: los tres verdes.

En el navegador, en Configuración → POS: el interruptor aparece, se puede apagar y encender, y el valor sobrevive a recargar la página. Déjalo **encendido** al terminar.

- [ ] **Step 3: Commit**

```bash
git add app/admin/configuracion/PosSection.tsx
git commit -m "feat(pos): interruptor de cierre de caja a ciegas en Configuracion (R7)"
```

---

## Task 3: Detalle de créditos y cobros del turno

**Files:**
- Modify: `app/admin/pos/actions.ts` (agregar al final, junto a `obtenerCobrosSesion`)
- Modify: `lib/pos/turnos.ts`
- Test: `lib/pos/tests/turnos.test.ts`

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces:
  - En `lib/pos/turnos.ts`:
    ```ts
    export interface CreditoOtorgado { documentoId: string; numero: string; cliente: string; monto: number }
    export interface CobroDelTurno { cobroId: string; numero: string; cliente: string; metodo: CobroMetodo; monto: number }
    export interface DetalleTurno { creditos: CreditoOtorgado[]; cobros: CobroDelTurno[] }
    export function totalCreditos(creditos: CreditoOtorgado[]): number
    export function totalCobros(cobros: CobroDelTurno[]): number
    ```
  - En `app/admin/pos/actions.ts`:
    ```ts
    export async function obtenerDetalleTurno(sesionId: string): Promise<PosResult<DetalleTurno>>
    ```
    `PosResult<T>` es `{ ok: true; data: T } | { ok: false; error: string }`.

**Contexto de datos:**
- Un **crédito otorgado** es un documento del turno con un pago de tipo `credito`. Los documentos ya se traen con `documento_pagos(monto, metodos_pago(tipo))`; el nombre del cliente está en la propia fila (`documentos.cliente_nombre`).
- Un **cobro del turno** es una fila de `cobros` con `sesion_id` = el turno. La tabla tiene `id`, `numero`, `cliente_id`, `fecha`, `monto`, `metodo`, `sesion_id`. El nombre del cliente **no** está ahí: hay que resolverlo contra `clientes`, igual que hace `mapaClientes` en `app/admin/cuentas-por-cobrar/actions.ts`.

- [ ] **Step 1: Escribir los tests que fallan**

Añade a `lib/pos/tests/turnos.test.ts` (extiende el import existente de `'../turnos'`):

```ts
describe('totales del detalle del turno', () => {
  it('suma los creditos otorgados redondeando a 2', () => {
    expect(totalCreditos([
      { documentoId: 'a', numero: 'F-001', cliente: 'Ana', monto: 100.1 },
      { documentoId: 'b', numero: 'F-002', cliente: 'Beto', monto: 200.25 },
    ])).toBe(300.35)
  })

  it('suma los cobros redondeando a 2', () => {
    expect(totalCobros([
      { cobroId: 'a', numero: 'C-001', cliente: 'Ana', metodo: 'efectivo', monto: 0.1 },
      { cobroId: 'b', numero: 'C-002', cliente: 'Ana', metodo: 'tarjeta', monto: 0.2 },
    ])).toBe(0.3)
  })

  it('sin lineas devuelven cero', () => {
    expect(totalCreditos([])).toBe(0)
    expect(totalCobros([])).toBe(0)
  })
})
```

- [ ] **Step 2: Correr para verificar que fallan**

```bash
npx vitest run lib/pos/tests/turnos.test.ts
```
Esperado: FALLA — `totalCreditos` y `totalCobros` no existen.

- [ ] **Step 3: Implementar los tipos y los totales**

Al final de `lib/pos/turnos.ts` (reutiliza el `round2` que ya está definido arriba en el archivo; **no lo redefinas**):

```ts
import type { CobroMetodo } from '@/types'

export interface CreditoOtorgado {
  documentoId: string
  numero: string
  cliente: string
  monto: number
}

export interface CobroDelTurno {
  cobroId: string
  numero: string
  cliente: string
  metodo: CobroMetodo
  monto: number
}

export interface DetalleTurno {
  creditos: CreditoOtorgado[]
  cobros: CobroDelTurno[]
}

export function totalCreditos(creditos: CreditoOtorgado[]): number {
  return round2(creditos.reduce((s, c) => s + c.monto, 0))
}

export function totalCobros(cobros: CobroDelTurno[]): number {
  return round2(cobros.reduce((s, c) => s + c.monto, 0))
}
```

El `import type` va arriba del archivo, junto al de `SesionCaja`.

- [ ] **Step 4: Correr los tests**

```bash
npx vitest run lib/pos/tests/turnos.test.ts
```
Esperado: PASA.

- [ ] **Step 5: Escribir el Server Action**

Al final de `app/admin/pos/actions.ts`, junto a `obtenerCobrosSesion` (línea ~273), añade `obtenerDetalleTurno`. Requisitos concretos:

- Trae los documentos del turno con `.from('documentos').select('id, numero_comprobante, correlativo, cliente_nombre, estado, documento_pagos(monto, metodos_pago(tipo))').eq('sesion_id', sesionId).limit(5000)`.
- **Antes de escribirlo, lee `app/admin/pos/actions.ts` alrededor de la línea 199-226**: hay un comentario que explica que, sin tipos `Database` generados, el cliente de Supabase infiere `documento_pagos → metodos_pago` como arreglo, pero PostgREST devuelve un **objeto** para ese embed to-one. **Replica ese mapeo tal cual.** Si no lo haces, ningún pago se reconoce como `credito` y la lista sale vacía en silencio.
- Un documento entra a `creditos` si su `estado` es `'emitido'` y tiene al menos un pago con `tipo === 'credito'`; el `monto` es la suma de esos pagos de crédito, no el total del documento (una venta puede ser mixta: parte efectivo, parte crédito).
- El `numero` que se muestra sale de **`numeroDocumento()` de `lib/pos/documentos.ts`**, que es el helper que ya usa el resto de la app para rotular un documento. Léelo para ver qué campos espera y tráelos en el `select`; no concatenes correlativo y número a mano.
- Trae los cobros con `.from('cobros').select('id, numero, cliente_id, metodo, monto').eq('sesion_id', sesionId).limit(5000)` y resuelve el nombre del cliente contra `clientes` mapeando por id en JS (patrón de `mapaClientes` en `app/admin/cuentas-por-cobrar/actions.ts`). Si un cliente no se resuelve, muestra `'—'`; no dejes `undefined`.
- Devuelve `{ ok: true, data: { creditos, cobros } }`, o `{ ok: false, error: ERROR_GENERICO }` ante error, igual que las demás acciones del archivo.

- [ ] **Step 6: Verificar**

```bash
npx tsc --noEmit
npm test
npm run build
```
Esperado: los tres verdes.

Comprobación funcional: en un turno real que tenga al menos una venta al crédito o un cobro de CxC, confirma que la acción devuelve esas líneas con cliente y monto correctos. Si `creditos` sale vacío en un turno que sí tuvo ventas al crédito, el mapeo del embed del Step 5 está mal.

- [ ] **Step 7: Commit**

```bash
git add app/admin/pos/actions.ts lib/pos/turnos.ts lib/pos/tests/turnos.test.ts
git commit -m "feat(pos): detalle de creditos otorgados y cobros del turno (R7)"
```

---

## Task 4: Componente del comprobante

**Files:**
- Create: `components/pos/ComprobanteTurno.tsx`
- Create: `components/pos/comprobante-turno.module.css`

**Interfaces:**
- Consumes:
  - `DetalleTurno`, `CreditoOtorgado`, `CobroDelTurno`, `totalCreditos`, `totalCobros` de `@/lib/pos/turnos` (Task 3).
  - El retorno de `esperadoCaja` con `cambioEntregado` (Task 1).
  - Los resolvers de `@/lib/empresa/perfil`: `nombreComercial(cfg)`, que recibe el `ConfigMap` y devuelve `string`.
  - `formatPrice` de `@/lib/store/format`.
- Produces:
  ```ts
  export interface ComprobanteTurnoProps {
    sesion: SesionCaja
    cajaNombre: string
    empresaNombre: string
    porMetodo: Record<MetodoPagoTipo, number>
    cobrosPorMetodo: Record<CobroMetodo, number>
    devolucionesPorMetodo: Record<CobroMetodo, number>
    cambioEntregado: number
    detalle: DetalleTurno
    impresoEn: string  // ISO; el llamador lo fija
  }
  export default function ComprobanteTurno(props: ComprobanteTurnoProps): JSX.Element
  ```
  Es **presentación pura**: no consulta datos, no calcula dinero salvo los totales de las funciones puras, y no imprime por su cuenta (el botón lo pone quien lo monta).

- [ ] **Step 1: Crear el componente**

Bloques, en este orden:

1. **Encabezado:** `empresaNombre`, la caja, el usuario del turno.
2. **Turno:** apertura y cierre con fecha y hora. **Formatea con `timeZone: 'America/Tegucigalpa'` explícito** — si esto se renderiza en un Server Component, Vercel corre en UTC y la hora saldría 6 horas corrida (bug real de R6). Si el turno sigue abierto, el cierre muestra `—`.
3. **Arqueo:** monto inicial, efectivo esperado, contado, y la diferencia rotulada `Cuadra exacto` si es 0, `Sobrante` si es positiva, `Faltante` si es negativa, mostrando el **valor absoluto** (mismo criterio que `CierreModal`). Los tres valores del arqueo salen de `sesion.monto_esperado` / `monto_contado` / `diferencia`; si alguno es `null` (turno abierto) muestra `—`, **no** `L. 0.00`.
4. **Ingresos por método de pago:** una línea por método con monto > 0, de `porMetodo`. Debajo, la línea **Cambio entregado** con `cambioEntregado`.

   **La identidad que el cajero debe poder seguir a mano es esta, y tiene seis términos, no tres:**

   ```
   efectivo esperado = monto inicial
                     + efectivo L. cobrado        (porMetodo.efectivo_lps)
                     + efectivo USD cobrado       (porMetodo.efectivo_usd)
                     − cambio entregado           (cambioEntregado)
                     + cobros de CxC en efectivo  (cobrosPorMetodo.efectivo)
                     − reembolsos en efectivo     (devolucionesPorMetodo.efectivo)
   ```

   Los tres últimos términos **no son opcionales**: en un turno con cobros de cuentas por cobrar o con devoluciones —lo normal en este POS— la versión corta no cuadra, y el cajero se queda sin poder explicar la diferencia. El comprobante debe mostrar **cada uno de esos seis renglones** cuando su valor no sea cero, con el efectivo esperado como total al pie. Los métodos que no son efectivo (tarjeta, transferencia, crédito, saldo a favor) se listan como informativos, claramente separados del bloque que suma, porque no entran al cuadre de la gaveta.
5. **Créditos otorgados:** una línea por `CreditoOtorgado` (número, cliente, monto) y su total con `totalCreditos`. Si no hay, omite el bloque entero. Incluye la aclaración: **No entró efectivo a caja.**
6. **Cobros de CxC recibidos:** una línea por `CobroDelTurno` (número, cliente, método, monto) y su total con `totalCobros`. Si no hay, omite el bloque.
7. **Devoluciones / reembolsos:** por método, solo los que tengan monto > 0. Si no hay, omite el bloque.
8. **Pie:** `Impreso el <fecha y hora de impresoEn>`. Es obligatorio, y el motivo es concreto: `anular_comprobante` **no exige que la sesión siga abierta**, así que un comprobante de un turno ya cerrado puede anularse después. Si alguien reimprime ese cierre, el documento anulado desaparece tanto del desglose por método como de la lista de créditos otorgados, y la copia nueva muestra **un crédito menos** que el papel original — sin ninguna señal de por qué. La fecha y hora de impresión es lo que hace explicable esa diferencia entre dos copias. El arqueo (esperado, contado, diferencia) no se ve afectado: sale de los valores congelados.

- [ ] **Step 2: Crear el módulo CSS**

Copia el patrón de la hoja de 80 mm que ya existe en `app/admin/pos/documento/documento.module.css` (busca `.hoja80` y su bloque `@media print`): ancho `80mm`, fondo blanco y tinta oscura fijos, tipografía monoespaciada o pequeña, sin sombras al imprimir. **No importes ese módulo** — copia el patrón a uno propio, porque el del documento sirve a hojas fiscales inmutables.

Reglas obligatorias:
- El contenedor a `width: 80mm` y, en `@media print`, sin márgenes de página añadidos ni `box-shadow`.
- Cualquier elemento que no deba imprimirse (botones) va en una clase con `display: none` dentro de `@media print`.
- Filas de dos columnas (concepto a la izquierda, monto a la derecha, alineado) sin que un monto largo obligue a scroll horizontal.

- [ ] **Step 3: Verificar**

```bash
npx tsc --noEmit
npm test
npm run build
```
Esperado: los tres verdes. En esta tarea el componente todavía no se monta en ninguna pantalla, así que no hay comprobación visual: la hace la Task 5.

- [ ] **Step 4: Commit**

```bash
git add components/pos/ComprobanteTurno.tsx components/pos/comprobante-turno.module.css
git commit -m "feat(pos): comprobante de cierre de turno imprimible en tirilla (R7)"
```

---

## Task 5: Conectar el interruptor y el comprobante en los tres puntos

**Files:**
- Modify: `app/admin/pos/components/CierreModal.tsx`
- Modify: `app/admin/pos/turnos/TurnosClient.tsx`
- Modify: `app/admin/pos/turnos/[id]/page.tsx` y `app/admin/pos/turnos/[id]/TurnoDetalleView.tsx`
- Modify: `app/admin/pos/page.tsx` y `app/admin/pos/turnos/page.tsx` (leen la clave)

**Interfaces:**
- Consumes: `ComprobanteTurno` y sus props (Task 4); `obtenerDetalleTurno` (Task 3); la clave `pos_cierre_ciegas` (Task 2); `cambioEntregado` (Task 1).
- Produces: nada para tareas posteriores.

- [ ] **Step 1: Pasar la clave a los clientes**

`app/admin/pos/page.tsx` y `app/admin/pos/turnos/page.tsx` ya leen `configuracion`. Lee la clave con el criterio del proyecto y pásala como prop booleana:

```tsx
const cierreCiegas = config.pos_cierre_ciegas !== 'false'
```

- [ ] **Step 2: `CierreModal` respeta el interruptor**

Hoy el modal muestra el efectivo esperado y su desglose **antes** de teclear el conteo (líneas ~110-152). Con `cierreCiegas` en `true`, esos bloques no se renderizan; con `false`, se muestran como hoy.

**No toques el cálculo:** `esperadoCaja` se sigue invocando igual y `cerrarSesion` sigue siendo quien congela. El interruptor solo decide qué se pinta.

- [ ] **Step 3: Mostrar el comprobante al cerrar, en los dos caminos**

Tras un cierre exitoso, `cerrarSesion` devuelve `{ esperado, diferencia }`. En ese momento, tanto en `CierreModal` como en `TurnosClient`:

1. Llama `obtenerDetalleTurno(sesion.id)`.
2. Monta `ComprobanteTurno` con los datos del turno recién cerrado, fijando `impresoEn` con la hora del momento.
3. Ofrece un botón **Imprimir** que llame `window.print()`, y otro para cerrar la vista.

Los botones **deben combinar** la clase global `btnMerlin*` con la clase de layout del módulo. Un botón con solo la clase global se pinta como texto suelto — es el bug que el usuario reportó en R6.

- [ ] **Step 4: Comprobante reimprimible desde el detalle del turno**

`app/admin/pos/turnos/[id]/page.tsx` ya carga la sesión, la caja, los documentos y —desde el arreglo de R6— los cobros y devoluciones. Añade la llamada a `obtenerDetalleTurno(id)` y pasa el resultado a la vista.

En `TurnoDetalleView.tsx`, añade un botón **Imprimir comprobante** que muestre `ComprobanteTurno`. Además, **retira la nota** que R6 puso bajo el desglose ("Montos cobrados en bruto: el cambio entregado ya está restado…"): con la línea de cambio entregado (Task 1) el desglose ya reconcilia y la nota pasa a ser falsa.

- [ ] **Step 5: Verificar**

```bash
npx tsc --noEmit
npm test
npm run build
npx eslint app/admin/pos components/pos
```
Esperado: los cuatro sin problemas nuevos.

Comprobación funcional con un turno real, **todas obligatorias**:

1. Con el interruptor **encendido**, abre el modal de cierre en el mostrador: **no** debe verse el efectivo esperado antes de teclear el conteo. Apágalo y confirma que sí se ve.
2. Cierra un turno con el interruptor encendido y anota los tres valores del arqueo. Vuelve a abrir uno equivalente, apaga el interruptor y ciérralo igual: **el arqueo congelado debe calcularse igual en ambos casos** — el interruptor no puede alterar el resultado.
3. El comprobante aparece tras cerrar, en los dos caminos.
4. En el comprobante, comprueba a mano la identidad de cuadre **completa**, con sus seis términos: **monto inicial + efectivo L. + efectivo USD − cambio entregado + cobros de CxC en efectivo − reembolsos en efectivo = efectivo esperado**. Hazlo en un turno que tenga **al menos un cobro de CxC o una devolución**; si el turno no tuvo ninguno, la versión corta también cuadraría y la prueba no demuestra nada.
5. Reimprime el comprobante desde `/admin/pos/turnos/[id]` y verifica que dice **exactamente lo mismo** que el que salió al cerrar, salvo la fecha de impresión.
6. Vista previa de impresión: a 80 mm no se corta contenido a lo ancho.

Deja el estado de la BD como lo encontraste y el interruptor **encendido**.

- [ ] **Step 6: Commit**

```bash
git add app/admin/pos components/pos
git commit -m "feat(pos): cierre a ciegas configurable y comprobante en los tres puntos (R7)"
```

---

## Autorrevisión del plan

**Cobertura del spec:**

| Requisito del spec | Tarea |
|---|---|
| Interruptor global `pos_cierre_ciegas` en Configuración → POS | Task 2 |
| Criterio "ausente = a ciegas activo" | Task 2 (Produces) y Task 5 Step 1 |
| Gobierna los **dos** caminos de cierre | Task 5, Steps 1-2 |
| El interruptor no altera cálculo ni lo persistido | Task 5 Step 2 + comprobación 2 del Step 5 |
| Encabezado, turno, arqueo | Task 4 Step 1, bloques 1-3 |
| Ingresos por método de pago | Task 4 Step 1, bloque 4 |
| Detalle de créditos otorgados | Tasks 3 y 4 (bloque 5) |
| Detalle de cobros de CxC | Tasks 3 y 4 (bloque 6) |
| Devoluciones / reembolsos | Task 4 Step 1, bloque 7 |
| Fuera: totales por cliente y saldo pendiente | Ningún paso los construye — omisión deliberada |
| Aparece al confirmar el cierre (ambos caminos) | Task 5 Step 3 |
| Aparece en el detalle del turno, reimprimible | Task 5 Step 4 |
| Impresión en tirilla reutilizando `.hoja80` | Task 4 Step 2 |
| Arqueo desde valores congelados | Task 4 Step 1, bloque 3 |
| Fecha y hora de impresión | Task 4 Step 1, bloque 8 |
| `esperadoCaja` devuelve el cambio acumulado | Task 1 |
| Se retira la nota que R6 puso en el detalle | Task 5 Step 4 |
| Sin migración | Ningún paso escribe SQL |

Sin huecos.

**Escaneo de placeholders:** sin "TBD", sin "similar a la Task N", sin pasos que describan sin mostrar. Los tres puntos donde el plan manda leer el código antes de escribir (el mapeo del embed to-one en Task 3 Step 5, el helper de rótulo de documento en el mismo paso, y el patrón `.hoja80` en Task 4 Step 2) son verificaciones contra el código real, no huecos: en los tres se dice qué buscar y qué falla si se ignora.

**Consistencia de tipos:** `cambioEntregado: number` se define en Task 1 y se consume con ese nombre en Tasks 4 y 5. `CreditoOtorgado`, `CobroDelTurno`, `DetalleTurno`, `totalCreditos` y `totalCobros` conservan nombre y forma entre Task 3 y Task 4. `ComprobanteTurnoProps` enumera exactamente lo que Task 5 le pasa. `PosResult<T>` se documenta en el bloque Interfaces de Task 3 porque el implementador no lo tiene a la vista. `CobroMetodo` y `MetodoPagoTipo` se importan de `@/types`, donde ya existen.
