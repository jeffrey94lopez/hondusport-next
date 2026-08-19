# P-detalle D2 — El documento como pantalla de plataforma — Plan de implementación

> **Para trabajadores agénticos:** SUB-SKILL REQUERIDA: usa superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan sintaxis de checkbox (`- [ ]`) para seguimiento.

**Goal:** Que `/admin/pos/documento/[id]` deje de ser una hoja de papel en pantalla y pase a ser una página de aterrizaje navegable, con toda la información del documento y sus acciones a mano.

**Architecture:** `DocumentoView` conserva su firma y sus datos; lo que cambia es qué renderiza. En vez de mostrar la hoja imprimible en pantalla, muestra cards de plataforma que leen el **mismo snapshot congelado** —sin recalcular un solo importe— y la hoja queda montada pero visible únicamente al imprimir. El cliente y los ítems enlazan a las fichas que creó D1. La acción de anular se trae de la lista reutilizando su Server Action y su modal, sin tocar reglas.

**Tech Stack:** Next.js 16 (App Router, Server Components + Server Actions), React 19, TypeScript, Supabase (PostgREST), CSS Modules, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-18-pdetalle-d2-documento-design.md`

## Global Constraints

- **LA HOJA IMPRIMIBLE NO SE TOCA.** `DocumentoHoja.tsx` y `NotaCreditoHoja.tsx` no se modifican: ni su contenido, ni su maquetación, ni lo que imprimen. Los documentos llevan un trigger de inmutabilidad en la base (`documentos_bloquear_edicion_trg`) y su contenido responde ante la SAR. Si una tarea cree que necesita cambiarlos, está equivocada: la pantalla nueva es un componente aparte.
- **Sin migración.** Ninguna tarea escribe SQL.
- **Ningún importe se recalcula.** Todos salen de las columnas del documento (`total_exento`, `total_exonerado`, `total_gravado15/18`, `isv15/18`, `descuento_total`, `total`, `total_letras`) y se muestran con `formatPrice()` de `@/lib/store/format`: 2 decimales, Lempiras `L.`. La única cifra derivada permitida es el cambio entregado, y sale de `cambioPago` de `@/lib/pos/emision`, nunca de una resta escrita en el componente.
- **Reutilizar, no reimplementar:** `numeroDocumento` y `TIPO_DOCUMENTO_LABEL` de `@/lib/pos/documentos` (ya cubren los cuatro tipos), `puedeDevolverDocumento` y `estadoDevolucionDocumento` de `@/lib/pos/devoluciones`, el CSS compartido `app/admin/ficha.module.css`, el `DevolucionModal` existente y la acción `anularDocumento` de `@/app/admin/pos/actions`.
- **Enlaces que no mienten:** un ítem libre tiene `producto_id` nulo y **no se enlaza**; un documento a consumidor final puede no tener `cliente_id` y tampoco. Un enlace que lleva a ninguna parte es peor que texto plano.
- **Acciones que no aplican desaparecen, no se deshabilitan sin explicación.** Una factura no se anula (se revierte con nota de crédito) y la pantalla debe decirlo. Una NC o devolución no se anula ni se devuelve.
- **Zona horaria:** todo formateo de fecha lleva `timeZone: 'America/Tegucigalpa'`. Vercel corre en UTC y sin eso las horas salen seis horas corridas; en local no se nota.
- **Botones:** las clases globales `btnMerlin*` de `app/merlin.css` solo aportan color, radio y tipografía — **sin padding ni display**. Todo botón las combina con una clase de layout del módulo.
- **Impresión:** lo que no debe salir por la impresora va oculto en `@media print`, y ninguna caja que envuelva la hoja puede llevar `overflow: hidden` — se recortaría en la primera página en vez de fragmentar.
- **Especificidad CSS:** la regla global de `app/globals.css` sobre `input[type=...]`/`textarea`/`select` (0,1,1) pisa una clase de módulo sola (0,1,0) — usa selector compuesto. Y una clase sobre un `<td>` pierde contra la regla `td` de la tabla: el color va en `.table td.miClase`.
- **`composes:`** debe ser la primera declaración de una regla de CSS Module.
- **`.limit()` explícito** en cualquier consulta nueva.
- **Tokens Merlin**; UI, dominio y commits en español, formato convencional.
- Al cerrar cada tarea: `npx tsc --noEmit`, `npm test`, `npm run build`. Reportar resultados reales.
- **Entorno:** el repo está en OneDrive y bloquea archivos. `npm run build` puede fallar con `EPERM ... unlink '.next\...'`; si pasa, detén el servidor de desarrollo, `rm -rf .next` y reintenta. **No encadenes `rm -rf .next` con `npm test`**: vitest omite archivos en silencio y la corrida pasa en verde estando incompleta. La corrida buena da **46 archivos / 642 tests**. `npm run lint` completo excede el tiempo; usa `npx eslint` sobre los directorios que toques.
- **`/admin` exige Supabase Auth** y los implementadores de las olas anteriores no lograron autenticarse. **No inventes credenciales ni las pidas.** Si no puedes verificar en el navegador, dilo explícitamente y no afirmes haber comprobado nada que no ejecutaste.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `app/admin/pos/documento/[id]/page.tsx` | **Modificar** — ampliar el `select` de devoluciones asociadas y del documento origen para poder enlazarlos. |
| `app/admin/pos/documento/[id]/DocumentoPantalla.tsx` | **Crear** — las cards de plataforma. Presentación pura. |
| `app/admin/pos/documento/[id]/DocumentoView.tsx` | **Modificar** — monta la pantalla nueva, oculta la hoja salvo al imprimir, y añade la acción de anular. |
| `app/admin/pos/documento/documento.module.css` | **Modificar** — clases de la pantalla nueva y reglas de impresión. |

---

## Task 1: Datos para los enlaces de trazabilidad

**Files:**
- Modify: `app/admin/pos/documento/[id]/page.tsx:37-43` (devoluciones asociadas) y `:68-70` (documento origen)

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces: dos props nuevas para `DocumentoView`:
  ```ts
  devoluciones: Array<{ id: string; tipo: 'nota_credito' | 'devolucion'; correlativo: string | null; numero_comprobante: number | null; total: number }>
  origen: { id: string; tipo: Documento['tipo']; correlativo: string | null; numero_comprobante: number | null } | null
  ```
  La Task 2 las consume.

**Por qué:** hoy la consulta de devoluciones asociadas trae **solo `total`** —le basta para el badge de "Devuelto"— y la de origen no trae `id`. Sin esos campos no se puede enlazar a ninguno de los dos, que es media trazabilidad de la pantalla.

- [ ] **Step 1: Ampliar la consulta de devoluciones asociadas**

En `page.tsx`, la consulta que hoy es:

```ts
supabase
  .from('documentos')
  .select('total')
  .eq('documento_origen_id', id)
  .in('tipo', ['nota_credito', 'devolucion'])
  .neq('estado', 'anulado'),
```

pasa a traer también lo necesario para rotular y enlazar, con `.limit()` y orden estable:

```ts
supabase
  .from('documentos')
  .select('id, tipo, correlativo, numero_comprobante, total')
  .eq('documento_origen_id', id)
  .in('tipo', ['nota_credito', 'devolucion'])
  .neq('estado', 'anulado')
  .order('created_at')
  .limit(200),
```

**El cálculo de `sumaDevuelta` y `estadoDevolucion` no cambia**: sigue sumando `d.total` sobre el mismo conjunto. Compruébalo — ese es el valor que decide si el documento se puede devolver.

- [ ] **Step 2: Ampliar la consulta del documento origen**

La de origen hoy selecciona `'tipo, correlativo, numero_comprobante'`. Añade `id`, que es lo que permite enlazar.

- [ ] **Step 3: Pasar ambas como props**

`DocumentoView` ya recibe `origen`; amplía su tipo con `id`. Añade la prop `devoluciones` con la forma del bloque *Produces*. Que la Task 2 las use todavía no es necesario: esta tarea solo garantiza que los datos lleguen.

- [ ] **Step 4: Verificar**

```bash
npx tsc --noEmit
npm test
npm run build
```
Esperado: los tres verdes. El badge de "Devuelto (parcial/total)" debe seguir comportándose igual — es la señal de que no se rompió `estadoDevolucion`.

- [ ] **Step 5: Commit**

```bash
git add "app/admin/pos/documento"
git commit -m "feat(pos): traer los datos para enlazar devoluciones y documento origen (D2)"
```

---

## Task 2: La pantalla de plataforma

**Files:**
- Create: `app/admin/pos/documento/[id]/DocumentoPantalla.tsx`
- Modify: `app/admin/pos/documento/documento.module.css`

**Interfaces:**
- Consumes: las props de la Task 1; `numeroDocumento` y `TIPO_DOCUMENTO_LABEL` de `@/lib/pos/documentos`; `cambioPago` de `@/lib/pos/emision`; los tipos `Documento`, `DocumentoItem`, `DocumentoPagoConMetodo`, `Caja`, `NotaCreditoReembolso` de `@/types`.
- Produces:
  ```tsx
  export default function DocumentoPantalla(props: {
    documento: Documento
    items: DocumentoItem[]
    pagos: DocumentoPagoConMetodo[]
    caja: Caja
    devoluciones: Array<{ id: string; tipo: 'nota_credito' | 'devolucion'; correlativo: string | null; numero_comprobante: number | null; total: number }>
    origen: { id: string; tipo: Documento['tipo']; correlativo: string | null; numero_comprobante: number | null } | null
    reembolsos: NotaCreditoReembolso[]
  }): JSX.Element
  ```
  Es **presentación pura**: no consulta datos, no llama Server Actions, no tiene estado. Las acciones las monta la Task 3.

- [ ] **Step 1: Los bloques**

Crear `DocumentoPantalla.tsx` con estas cards, en este orden:

1. **Cabecera** — tipo (`TIPO_DOCUMENTO_LABEL[documento.tipo]`) y número (`numeroDocumento(documento)`), fecha y hora de emisión, caja, vendedor y usuario. Badges de **Anulado** y de **Devuelto (parcial/total)**.
2. **Cliente** — `cliente_nombre`, `cliente_rtn`, `cliente_identidad`, y si `exonerado`: `constancia_exonerado`, `registro_sag`, `orden_compra_exenta`. **Enlaza a `/admin/clientes/${documento.cliente_id}` solo si `cliente_id` no es nulo**; si lo es, texto plano.
3. **Ítems** — tabla con descripción, cantidad, precio unitario, descuento, ISV e importe. **Cada línea enlaza a `/admin/productos/${it.producto_id}` solo si `producto_id` no es nulo.**
4. **Métodos de pago** — card propia: por cada pago, `metodo_nombre`, `referencia` si la tiene, y `monto`. Si hubo cambio, una línea **Cambio entregado** con `cambioPago(pagos, documento.total)`. **Ojo:** esa función espera objetos con `monto`; pásale lo que necesita y no reimplementes la resta.
5. **Totales** — exento, exonerado, gravado 15, gravado 18, ISV 15, ISV 18, descuento y total, omitiendo los que sean cero salvo el total. Debajo, `total_letras`.
6. **Anulación** — solo si `estado === 'anulado'`: `anulado_motivo` y `anulado_at`. Hoy esto **solo se ve dentro de la hoja imprimible**, así que quien revisa en pantalla no lo ve sin mandar a imprimir.
7. **Reembolsos** — solo si el documento es NC o devolución y `reembolsos` no está vacío: su vía y monto. Reutiliza `LABEL_REEMBOLSO` de `@/lib/pos/devoluciones` para los rótulos.
8. **Trazabilidad** — si `origen` no es nulo, "Revierte a" con enlace a `/admin/pos/documento/${origen.id}`. Si `devoluciones` no está vacío, "Devoluciones de este documento" listándolas con su número y total, cada una enlazando a su documento.

Las fechas se formatean con `timeZone: 'America/Tegucigalpa'`.

- [ ] **Step 2: Los estilos**

En `documento.module.css`, añade las clases de la pantalla nueva **componiendo del compartido de fichas**, que es exactamente este patrón y ya está en producción:

```css
.pantalla { composes: page from '../../ficha.module.css'; }
.card { composes: card from '../../ficha.module.css'; }
.cardTitle { composes: cardTitle from '../../ficha.module.css'; }
.grid { composes: grid from '../../ficha.module.css'; }
.dato { composes: dato from '../../ficha.module.css'; }
.datoLabel { composes: datoLabel from '../../ficha.module.css'; }
.datoValor { composes: datoValor from '../../ficha.module.css'; }
.tableWrap { composes: tableWrap from '../../ficha.module.css'; }
.table { composes: table from '../../ficha.module.css'; }
.empty { composes: empty from '../../ficha.module.css'; }
.numeroLink { composes: numeroLink from '../../ficha.module.css'; }
```

**Verifica la profundidad de la ruta**: este módulo vive en `app/admin/pos/documento/`, así que hasta `app/admin/` son **dos** niveles (`../../`). Confírmalo contra la ruta real del archivo antes de darlo por bueno; una ruta mal contada rompe el build.

Lo propio de esta pantalla (la fila de totales, el bloque de anulación) va con CSS local.

- [ ] **Step 3: Verificar**

```bash
npx tsc --noEmit
npm test
npm run build
```
Esperado: los tres verdes. En esta tarea el componente todavía no se monta, así que no hay comprobación visual posible: la hace la Task 3.

- [ ] **Step 4: Commit**

```bash
git add "app/admin/pos/documento"
git commit -m "feat(pos): pantalla de plataforma del documento (D2)"
```

---

## Task 3: Montarla, ocultar la hoja y traer la acción de anular

**Files:**
- Modify: `app/admin/pos/documento/[id]/DocumentoView.tsx`
- Modify: `app/admin/pos/documento/documento.module.css` (reglas de impresión)

**Interfaces:**
- Consumes: `DocumentoPantalla` (Task 2); `anularDocumento(documentoId: string, motivo: string): Promise<PosResult>` de `@/app/admin/pos/actions`; el `DevolucionModal` que `DocumentoView` ya monta.
- Produces: nada para tareas posteriores.

- [ ] **Step 1: Montar la pantalla y ocultar la hoja**

En `DocumentoView`, debajo de la barra de herramientas, renderiza `<DocumentoPantalla … />`. La hoja (`DocumentoHoja` o `NotaCreditoHoja`, según el tipo) **se sigue montando**, pero envuelta en un contenedor que solo es visible al imprimir:

- En pantalla: el contenedor de la hoja va oculto; la barra y la pantalla nueva, visibles.
- Al imprimir: al revés — la hoja visible, la barra y la pantalla ocultas.

**Dos trampas concretas que ya han costado arreglos en este repo:**

- El contenedor que envuelve la hoja **no puede llevar `overflow: hidden`**: una caja con ese valor no fragmenta entre páginas, se recorta en la primera. Ya pasó con el comprobante de turno en R7.
- Ocultar en pantalla con `display: none` y revelar en `@media print` funciona; **usar `visibility: hidden` no**, porque el elemento sigue ocupando su hueco.

**No modifiques `DocumentoHoja` ni `NotaCreditoHoja`.** Lo que cambia es dónde y cuándo se muestran, no lo que imprimen.

- [ ] **Step 2: Traer la acción de anular**

Añade el botón **Anular** a la barra, con **exactamente** las mismas condiciones que la lista (`DocumentosClient.tsx:156`), que no se relajan:

```
documento.tipo === 'comprobante' && documento.estado === 'emitido' && estadoDevolucion === 'ninguna'
```

Abre un modal que pida el motivo (requerido, no vacío) y llame `anularDocumento(documento.id, motivo.trim())`. Si devuelve `ok: false`, muestra `result.error` tal cual: el servidor rechaza además cuando hay cobros aplicados, con un mensaje que ya está redactado para el usuario. Tras anular, `router.refresh()`.

**Copia el modal de anulación de `DocumentosClient.tsx`** (el `AnularModal` que ya existe ahí) en vez de escribir uno nuevo; si acabas duplicando más de su JSX de lo razonable, extráelo a `app/admin/pos/components/` y que ambas pantallas lo consuman.

**Cuando la acción NO aplica, no muestres un botón deshabilitado sin más:**
- Si es **factura**: una nota explicando que una factura no se anula, se revierte con nota de crédito.
- Si es **NC o devolución**: ni el botón ni la nota — esas no se anulan ni se devuelven, y ofrecer la explicación de una factura ahí confundiría.
- Si es comprobante **ya devuelto**: el botón deshabilitado con su `title` explicando por qué, igual que en la lista.

- [ ] **Step 3: Verificar**

```bash
npx tsc --noEmit
npm test
npm run build
npx eslint app/admin/pos
```
Esperado: los cuatro sin problemas nuevos.

Comprobaciones funcionales con datos reales, **todas obligatorias** (si no puedes autenticarte, dilo y no las des por hechas):

1. **Un comprobante con varios métodos de pago:** la card los lista y sus montos suman el total del documento.
2. **Una factura:** aparece la nota de que no se anula, no un botón inerte.
3. **Un documento anulado:** se ve el motivo y la fecha **en pantalla**, sin tener que imprimir.
4. **Una nota de crédito:** enlaza a su documento origen y **no** ofrece anular ni devolver.
5. **Un documento con ítem libre y otro sin `cliente_id`:** se ven bien, sin enlaces rotos.
6. **Imprimir:** la hoja sale **idéntica** a como salía antes de esta ola, y la pantalla de plataforma **no** aparece en el papel. Compruébalo en los dos formatos, 80 mm y Carta, y con un documento largo para confirmar que la hoja fragmenta entre páginas en vez de recortarse.
7. **Anular de verdad** un comprobante de prueba y confirmar que el estado cambia y el motivo queda visible. Deja el estado de la BD como lo encontraste.

- [ ] **Step 4: Commit**

```bash
git add "app/admin/pos"
git commit -m "feat(pos): el documento se ve como pantalla y la hoja solo se imprime (D2)"
```

---

## Autorrevisión del plan

**Cobertura del spec:**

| Requisito del spec | Tarea |
|---|---|
| Cabecera con tipo, número, estado, fecha, caja, vendedor, usuario | Task 2, bloque 1 |
| Cliente con enlace a su ficha | Task 2, bloque 2 |
| Ítems con enlace a la ficha de producto | Task 2, bloque 3 |
| Métodos de pago en card propia + cambio entregado | Task 2, bloque 4 |
| Totales y total en letras | Task 2, bloque 5 |
| Bloque de anulación visible en pantalla | Task 2, bloque 6 |
| Devoluciones asociadas y documento origen, enlazados | Tasks 1 y 2 (bloque 8) |
| Imprimir con selector de formato | Task 3, Step 1 (se conserva el existente) |
| Devolver / Nota de crédito | Ningún step lo toca: ya existe y se conserva |
| Anular traído desde la lista, con sus mismas reglas | Task 3, Step 2 |
| Explicar por qué no aplica, en vez de botón inerte | Task 3, Step 2 |
| La hoja no se modifica y solo se ve al imprimir | Task 3, Step 1 + constraint global |
| Enlaces que no mienten (ítem libre, sin `cliente_id`) | Task 2, bloques 2 y 3 + comprobación 5 |
| Anular sigue también en la lista | Ningún step la quita — omisión deliberada |
| Sin migración | Ningún step escribe SQL |

Sin huecos.

**Escaneo de placeholders:** sin "TBD", sin "similar a la Task N", sin pasos que describan sin mostrar. Los tres puntos donde el plan manda verificar contra el árbol (la profundidad del `composes` en Task 2, las condiciones de anular en `DocumentosClient.tsx:156` y el `AnularModal` a copiar en Task 3) son comprobaciones contra el código real, no huecos: en los tres se dice qué buscar y qué falla si se ignora.

**Consistencia de tipos:** las dos props que produce la Task 1 (`devoluciones`, `origen` con `id`) son exactamente las que consume `DocumentoPantalla` en la Task 2. `cambioPago(pagos, total)` se documenta con su firma real, verificada en `lib/pos/emision.ts:61`. `anularDocumento` se documenta con la suya, verificada en `app/admin/pos/actions.ts:955`. `DocumentoPagoConMetodo` extiende `DocumentoPago` con `metodo_nombre` y `metodo_tipo`, y `page.tsx` ya hace ese mapeo — la pantalla lo recibe listo.

**Riesgo que el plan asume:** la comprobación 6 de la Task 3 (que la hoja impresa salga idéntica) es la única que protege la frontera fiscal, y **solo puede hacerla un humano con acceso al admin**. Si no se ejecuta, la ola se mezcla sin garantía de que el papel no cambió. Debe quedar dicho al entregar, no darse por supuesto.
