# P-detalle D1 — Fichas de cliente y de producto — Plan de implementación

> **Para trabajadores agénticos:** SUB-SKILL REQUERIDA: usa superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan sintaxis de checkbox (`- [ ]`) para seguimiento.

**Goal:** Dos páginas nuevas —ficha de cliente y ficha de producto— que resuman quién es cada entidad y cómo se ha movido, con enlaces a donde se opera.

**Architecture:** Ambas son Server Components que leen lo que ya existe y una vista de cliente que solo presenta; ninguna calcula dinero. El saldo por cobrar sale de `saldoCxcDeCliente`, el saldo a favor de la vista `saldo_favor_clientes` y el stock de `stockEfectivo`. El editor no se reescribe: la ficha de producto monta el `ProductoFields` que ya es compartido, y la de cliente monta un `ClienteFields` que la primera tarea extrae del formulario inline de la lista, siguiendo ese mismo patrón.

**Tech Stack:** Next.js 16 (App Router, Server Components + Server Actions), React 19, TypeScript, Supabase (PostgREST), CSS Modules, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-18-pdetalle-d1-fichas-design.md`

## Global Constraints

- **Sin migración.** Ninguna tarea escribe SQL. Todos los datos existen: `clientes`, `productos`, `producto_variantes`, `documentos`, `documento_items`, `cobros`, `compras`, `movimientos_inventario`, y las vistas `documento_saldos` y `saldo_favor_clientes`.
- **Ninguna ruta existente cambia.** Se agregan `/admin/clientes/[id]` y `/admin/productos/[id]`. El kardex sigue en `/admin/productos/[id]/movimientos`.
- **Solo lectura sobre dinero.** Las fichas muestran; no recalculan importes ni escriben nada salvo por el editor reutilizado. Todo importe con `formatPrice()` de `@/lib/store/format`: 2 decimales, Lempiras `L.`.
- **Reutilizar, no reimplementar:** `saldoCxcDeCliente` de `@/app/admin/cuentas-por-cobrar/actions`, `stockEfectivo` y `precioEfectivo`/`toStoreVariantes` de `@/lib/store/variantes`, `numeroDocumento` de `@/lib/pos/documentos`, y el patrón visual de `app/admin/tabla-admin.module.css` más las cards por sección del editor de producto.
- **Listados con `.limit()` explícito.** Sin él PostgREST aplica su tope por defecto y trunca en silencio.
- **Zona horaria:** todo formateo de fecha en código de servidor lleva `timeZone: 'America/Tegucigalpa'`. Vercel corre en UTC; sin eso las horas salen seis horas corridas y en local no se nota.
- **Botones:** las clases globales `btnMerlinPrimary`/`Secondary`/`Tertiary` de `app/merlin.css` solo aportan color, radio y tipografía — **no traen padding ni display**. Todo botón las combina con una clase de layout del módulo. Un botón con solo la clase global se pinta como texto suelto.
- **Especificidad CSS:** `app/globals.css` tiene una regla global sobre `input[type=...]`, `textarea` y `select` con especificidad (0,1,1) que pisa una clase de módulo sola (0,1,0) — usar selector compuesto de dos clases. Y una clase aplicada directo sobre un `<td>` pierde contra la regla `td` de la propia tabla: el color va en `.table td.miClase`.
- **`composes:`** debe ser la primera declaración de una regla de CSS Module.
- **Ítems libres:** `documento_items.producto_id` es **nulo** en los ítems libres del POS. Todo filtro o enlace por producto debe contemplarlo.
- **Tokens Merlin**; no hardcodear valores que ya tienen token.
- **Idioma:** UI, dominio y mensajes de commit en español, formato convencional.
- Al cerrar cada tarea: `npx tsc --noEmit`, `npm test`, `npm run build`. Reportar resultados reales.
- **Entorno:** el repo está en OneDrive y bloquea archivos. `npm run build` puede fallar con `EPERM ... unlink '.next\...'`; si pasa, detén el servidor de desarrollo, `rm -rf .next` y reintenta. **No encadenes `rm -rf .next` con `npm test` en el mismo comando**: vitest omite archivos en silencio y la corrida pasa en verde estando incompleta. La corrida buena da **45 archivos / 633 tests**. `npm run lint` completo excede el tiempo; usa `npx eslint` sobre los directorios que toques.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `components/admin/ClienteFields.tsx` | **Crear** — formulario de cliente extraído de la lista, espejo de `ProductoFields`. Exporta el componente y `clienteAForm`. |
| `app/admin/clientes/ClientesClient.tsx` | **Modificar** — consume `ClienteFields` en vez de su JSX inline. Sin cambio de comportamiento. |
| `app/admin/clientes/[id]/page.tsx` | **Crear** — Server Component: carga cliente, saldos, documentos, cobros y compras. |
| `app/admin/clientes/[id]/ClienteFichaView.tsx` | **Crear** — Client Component: bloques de la ficha + modal de edición. |
| `app/admin/clientes/[id]/ficha.module.css` | **Crear** — estilos, consumiendo `tabla-admin.module.css`. |
| `app/admin/productos/[id]/page.tsx` | **Crear** — Server Component: carga producto, variantes, movimientos y ventas. |
| `app/admin/productos/[id]/ProductoFichaView.tsx` | **Crear** — Client Component: bloques + modal de edición. |
| `app/admin/productos/[id]/ficha.module.css` | **Crear** — estilos. |
| `app/admin/productos/ProductosClient.tsx` | **Modificar** — el nombre del producto enlaza a su ficha. |

---

## Task 1: Extraer `ClienteFields`

**Files:**
- Create: `components/admin/ClienteFields.tsx`
- Modify: `app/admin/clientes/ClientesClient.tsx:257-432` (el bloque `{modal && (<Modal …>)}`)

**Interfaces:**
- Consumes: los tipos `Cliente` y `ClienteForm` de `@/types`, que ya existen.
- Produces:
  ```tsx
  export function clienteAForm(c: Cliente): ClienteForm
  export default function ClienteFields(props: {
    form: ClienteForm
    onChange: (form: ClienteForm) => void
  }): JSX.Element
  ```
  Las tareas 2 y 3 no dependen de esto salvo la 2, que lo monta.

**Por qué esta tarea existe:** el formulario de cliente vive inline en `ClientesClient.tsx` (~175 líneas de JSX). La ficha necesita el mismo formulario y duplicarlo garantizaría que los dos se desincronicen al primer campo nuevo. `ProductoFields` ya resolvió exactamente esto para productos y es el patrón a espejar.

- [ ] **Step 1: Leer el patrón a espejar**

Abre `components/admin/ProductoFields.tsx` y mira su forma: recibe `form` y un `onChange`, no tiene estado propio, no llama Server Actions, y exporta además un `productoAForm` que convierte la entidad al formulario. `ClienteFields` debe tener esa misma forma.

- [ ] **Step 2: Crear el componente**

Mueve a `components/admin/ClienteFields.tsx`:
- La constante `EMPTY_FORM` **no**: se queda en `ClientesClient` (es de la lista, para "crear").
- La función `clienteAForm` (línea 41 de `ClientesClient.tsx`): pásala tal cual y expórtala.
- Todo el JSX de campos que hoy vive dentro de `<Modal>`: los inputs de nombre, RTN, identidad, contacto, teléfono, correo, dirección, notas, los selects de tipo, los checkboxes de rol/exonerado/activo, y los campos de días y límite de crédito.

**No muevas** el `<Modal>` ni los botones del pie (Cancelar / Guardar): esos son de cada pantalla, porque el texto y la acción cambian entre "crear" y "editar" y entre lista y ficha.

**Conserva exactamente** cada `value`, `onChange`, `type`, `min`, `step`, `required` y el orden de tabulación. Es un refactor: el formulario debe comportarse igual.

- [ ] **Step 3: Consumirlo desde la lista**

En `ClientesClient.tsx`, reemplaza el JSX de campos por `<ClienteFields form={form} onChange={setForm} />` y quita la `clienteAForm` local en favor del import.

- [ ] **Step 4: Verificar que no cambió nada**

```bash
npx tsc --noEmit
npm test
npm run build
npx eslint app/admin/clientes components/admin
```
Esperado: los cuatro sin problemas nuevos.

En el navegador, en `/admin/clientes`: crear un cliente y editar uno existente. Ambos formularios deben verse y comportarse **idénticos** a antes, y guardar igual. Es el único criterio de esta tarea.

- [ ] **Step 5: Commit**

```bash
git add components/admin/ClienteFields.tsx app/admin/clientes/ClientesClient.tsx
git commit -m "refactor(admin): extraer ClienteFields para reusarlo fuera de la lista (D1)"
```

---

## Task 2: Ficha de cliente

**Files:**
- Create: `app/admin/clientes/[id]/page.tsx`
- Create: `app/admin/clientes/[id]/ClienteFichaView.tsx`
- Create: `app/admin/clientes/[id]/ficha.module.css`
- Modify: `app/admin/clientes/ClientesClient.tsx` (el nombre enlaza a la ficha)

**Interfaces:**
- Consumes: `ClienteFields` y `clienteAForm` de `@/components/admin/ClienteFields` (Task 1); `saldoCxcDeCliente(clienteId: string): Promise<number>` de `@/app/admin/cuentas-por-cobrar/actions`; `numeroDocumento` de `@/lib/pos/documentos`; el Server Action de guardado que ya usa la lista.
- Produces: la ruta `/admin/clientes/[id]`, a la que enlazará D2.

- [ ] **Step 1: Server Component**

Crear `app/admin/clientes/[id]/page.tsx`. Requisitos concretos:

- `params` es una **Promise** en el App Router de Next 16: `const { id } = await params`.
- Si el cliente no existe, `notFound()` de `next/navigation`.
- Carga en paralelo con `Promise.all`, **cada consulta con `.limit()` explícito**:
  - el cliente por id;
  - `saldoCxcDeCliente(id)`;
  - `saldo_favor_clientes` filtrado por `cliente_id`;
  - **documentos** del cliente: `.from('documentos').select('id, tipo, correlativo, numero_comprobante, estado, total, created_at').eq('cliente_id', id).order('created_at', { ascending: false }).limit(50)`;
  - **cobros**: `.from('cobros').select('id, numero, fecha, metodo, monto, referencia').eq('cliente_id', id).order('fecha', { ascending: false }).limit(50)`;
  - **compras**, solo si el contacto es proveedor: `.from('compras').select('id, numero, fecha, estado, total').eq('proveedor_id', id).order('fecha', { ascending: false }).limit(50)`.

**Antes de escribir la consulta de compras**, abre `app/admin/compras/page.tsx` y confirma los nombres reales de las columnas de `compras` (número, fecha, estado, total y el campo que apunta al proveedor). No los inventes.

- [ ] **Step 2: La vista**

Crear `ClienteFichaView.tsx` con los bloques del spec, en este orden: **Identidad**, **Condiciones**, **Saldos**, **Documentos emitidos**, **Cobros recibidos** y, solo si `es_proveedor`, **Compras al proveedor**.

Reglas que no son negociables:

- **Si el contacto no es cliente (`es_cliente === false`), los bloques de Saldos, Documentos y Cobros NO se renderizan.** No se muestran en cero: un "saldo por cobrar L. 0.00" en alguien a quien nunca se le factura es un dato falso disfrazado de información.
- El saldo por cobrar enlaza a `/admin/cuentas-por-cobrar/cliente/${id}` (su estado de cuenta) y el saldo a favor a `/admin/cuentas-por-cobrar`.
- Cada documento enlaza a `/admin/pos/documento/${d.id}`, rotulado con `numeroDocumento`. **Lee esa función** para ver qué campos espera y tráelos en el `select`.
- Los importes con `formatPrice`; las fechas con `timeZone: 'America/Tegucigalpa'`.
- El botón **Editar** abre un `Modal` con `<ClienteFields form={form} onChange={setForm} />` y llama al mismo Server Action de guardado que usa la lista. Tras guardar, `router.refresh()`.
- Los botones combinan `btnMerlin*` con una clase de layout del módulo.

- [ ] **Step 3: El módulo CSS**

Crear `ficha.module.css` consumiendo el patrón compartido:

```css
.page { composes: page from '../../tabla-admin.module.css'; }
.topbar { composes: topbar from '../../tabla-admin.module.css'; }
.title { composes: title from '../../tabla-admin.module.css'; }
.subtitle { composes: subtitle from '../../tabla-admin.module.css'; }
.tableWrap { composes: tableWrap from '../../tabla-admin.module.css'; overflow-x: auto; }
.table { composes: tabla from '../../tabla-admin.module.css'; }
.table tr:last-child td { border-bottom: none; }
.table td { vertical-align: middle; white-space: nowrap; }
.empty { composes: empty from '../../tabla-admin.module.css'; }
.btn { composes: btnPrimary from '../../tabla-admin.module.css'; display: inline-flex; align-items: center; justify-content: center; }
```

`overflow-x: auto` es obligatorio: el compartido trae `overflow: hidden` y con `nowrap` en las celdas de dinero las últimas columnas se recortarían sin scrollbar.

Para las cards por sección, copia el patrón de `.formSection` de `app/admin/productos/productos.module.css` (card blanca con título e iconos), que ya está validado visualmente.

- [ ] **Step 4: Entrada desde la lista**

En `ClientesClient.tsx`, el nombre del cliente en la tabla pasa a ser un `Link` a `/admin/clientes/${c.id}`. Usa el patrón de `.numeroLink` de `documentos.module.css` (color `--accent`, negrita, subrayado al hover) para que se lea como enlace. **El botón de editar de la fila se conserva**: sigue siendo el camino rápido desde la lista.

- [ ] **Step 5: Verificar**

```bash
npx tsc --noEmit
npm test
npm run build
npx eslint app/admin/clientes
```

Comprobaciones funcionales con datos reales, **todas obligatorias**:
1. Abrir la ficha de un cliente **con saldo pendiente** y confirmar que la cifra coincide con la que muestra el tablero de `/admin/cuentas-por-cobrar` para ese cliente.
2. Abrir la ficha de un contacto que sea **solo proveedor**: no deben aparecer los bloques de saldos, documentos ni cobros, y sí el de compras.
3. Editar desde la ficha y comprobar que el cambio se guarda y se refleja al recargar.
4. Un cliente **sin documentos**: la ficha se ve bien, con su estado vacío, sin errores.

- [ ] **Step 6: Commit**

```bash
git add "app/admin/clientes"
git commit -m "feat(admin): ficha de cliente con saldos, documentos y cobros (D1)"
```

---

## Task 3: Ficha de producto

**Files:**
- Create: `app/admin/productos/[id]/page.tsx`
- Create: `app/admin/productos/[id]/ProductoFichaView.tsx`
- Create: `app/admin/productos/[id]/ficha.module.css`
- Modify: `app/admin/productos/ProductosClient.tsx` (el nombre enlaza a la ficha)

**Interfaces:**
- Consumes: `ProductoFields` y `productoAForm` de `@/components/admin/ProductoFields` (ya existe y ya lo usan dos pantallas); `stockEfectivo` y `toStoreVariantes` de `@/lib/store/variantes`; `numeroDocumento` de `@/lib/pos/documentos`; el Server Action de guardado que ya usa la lista.
- Produces: la ruta `/admin/productos/[id]`, a la que enlazará D2.

**Cuidado con la ruta:** ya existe `app/admin/productos/[id]/movimientos/`. Estás creando el `page.tsx` del segmento padre, que hoy no lo tiene. No toques nada dentro de `movimientos/`.

- [ ] **Step 1: Server Component**

Crear `app/admin/productos/[id]/page.tsx`:

- `const { id } = await params`; `notFound()` si no existe.
- Carga en paralelo, **cada consulta con `.limit()` explícito**:
  - el producto por id, con los campos que la ficha muestra;
  - sus variantes: `.from('producto_variantes').select('*').eq('producto_id', id).order('orden').limit(500)`;
  - **movimientos recientes**: `.from('movimientos_inventario').select('*').eq('producto_id', id).order('created_at', { ascending: false }).limit(20)`;
  - **ventas recientes**: `.from('documento_items').select('documento_id, cantidad, importe, documentos(id, tipo, correlativo, numero_comprobante, estado, created_at)').eq('producto_id', id).limit(50)`.

**Sobre la consulta de ventas, dos cosas:**

Primero, el embed `documento_items → documentos` es **to-one**: sin tipos `Database` generados el cliente de Supabase lo infiere como arreglo, pero PostgREST devuelve un **objeto**. Lee el mapeo que ya hace `cerrarSesion` en `app/admin/pos/actions.ts` (alrededor de la línea 205, con un comentario largo que lo explica) y replícalo. Si lo ignoras, las ventas salen vacías **en silencio**.

Segundo, `.eq('producto_id', id)` ya excluye los ítems libres, que tienen `producto_id` nulo. Eso es correcto y deseado; confírmalo en el Step 4.

- [ ] **Step 2: La vista**

Crear `ProductoFichaView.tsx` con los bloques del spec: **Identidad**, **Precios**, **Stock**, **Variantes** (solo si tiene), **Movimientos recientes** y **Ventas recientes**.

Reglas concretas:

- El stock sale de `stockEfectivo(producto.stock, variantes)`. **`null` significa ilimitado, no cero** — muéstralo como "Ilimitado", nunca como `0`.
- El aviso de stock bajo solo aplica si hay `stock_minimo` configurado y el stock efectivo no es `null`.
- Los movimientos enlazan a `/admin/productos/${id}/movimientos` con un "Ver kardex completo"; la ficha solo muestra los últimos.
- Cada venta enlaza a `/admin/pos/documento/${d.id}`, rotulada con `numeroDocumento`.
- Importes con `formatPrice`; fechas con `timeZone: 'America/Tegucigalpa'`.
- **Editar** abre un `Modal` con `<ProductoFields …>` tal como lo monta `ProductosClient.tsx` — mira ahí qué props le pasa y replícalo. Tras guardar, `router.refresh()`.

- [ ] **Step 3: El módulo CSS**

Crear `ficha.module.css` con el mismo esqueleto de la Task 2 Step 3, ajustando la profundidad del `composes` a `'../../tabla-admin.module.css'`. Verifica la ruta relativa: este archivo vive en `app/admin/productos/[id]/`, así que son **dos** niveles hasta `app/admin/`.

- [ ] **Step 4: Entrada desde la lista**

En `ProductosClient.tsx`, el nombre del producto pasa a ser un `Link` a `/admin/productos/${p.id}`. Conserva el botón de editar y el de Kardex de la fila.

- [ ] **Step 5: Verificar**

```bash
npx tsc --noEmit
npm test
npm run build
npx eslint app/admin/productos
```

Comprobaciones funcionales con datos reales, **todas obligatorias**:
1. Un producto **con variantes**: el stock efectivo de la ficha coincide con el que muestra la lista de productos.
2. Un producto **plano con `stock` null**: la ficha dice "Ilimitado", no `0`.
3. Un producto **con ventas**: el bloque las lista y cada una abre su documento. Si sale vacío en un producto que sí se ha vendido, el mapeo del embed del Step 1 está mal.
4. Un producto **sin movimientos ni ventas**: la ficha se ve bien con sus estados vacíos.

- [ ] **Step 6: Commit**

```bash
git add "app/admin/productos"
git commit -m "feat(admin): ficha de producto con stock, variantes, kardex y ventas (D1)"
```

---

## Autorrevisión del plan

**Cobertura del spec:**

| Requisito del spec | Tarea |
|---|---|
| Ruta `/admin/clientes/[id]` | Task 2 |
| Ruta `/admin/productos/[id]` | Task 3 |
| Ficha cliente: identidad, condiciones, saldos, documentos, cobros, compras | Task 2, Step 2 |
| Ficha producto: identidad, precios, stock, variantes, movimientos, ventas | Task 3, Step 2 |
| Editar reutilizando el modal existente | Task 1 (extracción) + Tasks 2 y 3, Step 2 |
| Enlaces salientes (estado de cuenta, CxC, documentos, kardex) | Tasks 2 y 3, Step 2 |
| Entradas desde las listas | Tasks 2 y 3, Step 4 |
| Bloques de CxC omitidos si no es cliente | Task 2, Step 2 + comprobación 2 del Step 5 |
| Ítems libres no rompen nada | Task 3, Step 1 + comprobación 3 del Step 5 |
| Listados acotados con `.limit()` | Tasks 2 y 3, Step 1 |
| Kardex como modal — **descartado** | Ningún paso lo construye: omisión deliberada |
| Sin migración | Ningún paso escribe SQL |
| Ninguna ruta existente cambia | Ningún paso mueve directorios de `app/` |

Sin huecos.

**Escaneo de placeholders:** sin "TBD", sin "similar a la Task N", sin pasos que describan sin mostrar. Los cuatro puntos donde el plan manda leer código antes de escribir (el patrón de `ProductoFields` en Task 1, las columnas de `compras` en Task 2, el mapeo del embed to-one y el montaje de `ProductoFields` en Task 3) son verificaciones contra el árbol real, no huecos: en los cuatro se dice qué buscar y qué falla si se ignora.

**Consistencia de tipos:** `ClienteFields` y `clienteAForm` conservan nombre y firma entre la Task 1 y la 2. `saldoCxcDeCliente` se documenta con su firma real (`(clienteId: string) => Promise<number>`), verificada en `app/admin/cuentas-por-cobrar/actions.ts:218`. `stockEfectivo(stockPadre, variantes)` devuelve `number | null`, y el plan trata el `null` explícitamente en la Task 3. `ClienteForm` y `Cliente` ya existen en `@/types`.

**Deuda anotada, fuera de alcance:** `saldoCxcDeCliente` no lleva `.limit()` ni conteo. Es una suma que alimenta una pantalla, no un valor que se congele, así que el riesgo es mostrar un saldo corto y no persistir uno equivocado — pero pertenece al backlog de truncamiento ya abierto.
