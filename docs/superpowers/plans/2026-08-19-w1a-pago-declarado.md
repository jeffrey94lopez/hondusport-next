# W1a — El pago declarado: del checkout al panel — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el cliente declare cómo paga, reciba los datos bancarios para transferir, suba su comprobante, y que todo eso quede guardado, visible en el panel y avisado por n8n — sin que un pedido impago retenga inventario para siempre.

**Architecture:** El método de pago de la tienda no es un catálogo nuevo: es `metodos_pago` (el mismo del POS) con una marca de visibilidad, para que lo que el cliente declara sea literalmente el registro que después llevará el documento. El checkout relee ese método de la base como ya hace con los precios. Los datos bancarios se muestran **después** de confirmar, de modo que todo dinero recibido tenga un pedido detrás. El aviso a n8n sale por un publicador genérico y firmado que nunca bloquea la venta.

**Tech Stack:** Next.js 16 (App Router, Server Actions, Route Handlers), TypeScript, Supabase (PostgREST, RPC en plpgsql, Storage), Vitest, CSS Modules.

**Spec:** `docs/superpowers/specs/2026-08-19-w1-cierre-de-venta-design.md`

**Alcance de este plan:** los bloques 1 a 7 del spec. El bloque 8 (emisión del documento con pagos reales y turno abierto, con su migración a `emitir_documento`) va en un plan aparte, **W1b**, porque el propio spec pide que esa migración se revise separada del resto. Este plan entrega software completo por sí solo: al terminarlo el cliente declara y paga, el operador ve el comprobante y n8n avisa. La emisión sigue funcionando exactamente como hoy hasta que se ejecute W1b.

## Global Constraints

- **Idioma:** UI, nombres de dominio y mensajes de commit en **español**. Moneda en Lempiras, siempre con `formatPrice()`.
- **Frontera de confianza:** el checkout **relee de la base** el método de pago y la cuenta bancaria. Nunca se acepta el precio, el método ni la cuenta que manda el navegador. Es el mismo criterio que ya rige los precios en `app/(store)/checkout/actions.ts`.
- **Ningún importe se recalcula en un componente.** Toda cifra derivada sale de una función pura de `lib/` con test.
- **El aviso a n8n nunca bloquea la venta.** Si el webhook falla, tarda o no está configurado, el pedido se crea igual.
- **Datos personales:** el bucket `comprobantes` **no es público**. Se sirve con URL firmada de vigencia corta. A diferencia de `banners`, un comprobante bancario lleva datos del cliente.
- **Botones:** las clases globales `btnMerlin*` (`btnMerlinPrimary`, `btnMerlinSecondary`, `btnMerlinTertiary`, `btnMerlinIcon`, `btnMerlinChip`) aportan **solo** color, radio y tipografía — **sin padding y sin display**. Todo botón las combina con una clase de layout del módulo, o se pinta como texto suelto.
- **CSS Modules por componente.** `composes:` debe ser la **primera declaración** de la regla. La tienda scopea sus estilos bajo `.storeRoot` (ver `app/(store)/store-globals.css`).
- **Especificidad en tablas:** una clase sobre un `<td>` pierde contra la regla `td` de la propia tabla; hay que escribir `.tabla td.miClase`.
- **Tokens Merlin** de `app/merlin.css`; no hardcodear un valor que ya tenga token.
- **Zona horaria:** toda fecha formateada en servidor lleva `timeZone: 'America/Tegucigalpa'`. Vercel corre en UTC. La caducidad se calcula en **instantes absolutos**, no en días de calendario.
- **Números de cuenta bancaria son texto, nunca numéricos** — llevan ceros a la izquierda.
- **Al cerrar cada tarea:** `npx tsc --noEmit`, `npm test`, `npm run build` y `npx eslint <rutas tocadas>` verdes, reportando números reales. Línea base al empezar: **46 archivos / 658 tests**.
- **No ejecutar `rm -rf .next` encadenado con `npm test`**: en este repo (OneDrive) eso hace que vitest se salte archivos en silencio y reporte un verde incompleto.
- **Las migraciones no se aplican desde la aplicación.** Se escriben en `supabase/migrations/` y las aplica el usuario. Ninguna tarea debe intentar ejecutarlas.

---

## Estructura de archivos

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `supabase/migrations/2026-08-19-w1a-pagos-tienda.sql` | `metodos_pago.visible_tienda`, tabla `cuentas_bancarias`, RLS y grants | 1 |
| `types/index.ts` | Tipos `CuentaBancaria` y `visible_tienda` en `MetodoPago` | 1 |
| `app/admin/configuracion/PagosTiendaSection.tsx` | Visibilidad de métodos + CRUD de cuentas | 2 |
| `app/admin/configuracion/pagos-actions.ts` | Server Actions de esa sección | 2 |
| `supabase/migrations/2026-08-19-w1a-pedido-pago.sql` | Columnas de `pedidos`, bucket `comprobantes`, `crear_pedido` v3 | 3 |
| `lib/tienda/pagos.ts` + `tests/` | Validar el método declarado y calcular la caducidad | 4 |
| `app/(store)/checkout/actions.ts` | Frontera de confianza del método + honeypot + límite | 5 |
| `components/store/CheckoutModal.tsx` | Bloque de método de pago y campo trampa | 5 |
| `lib/store/whatsapp.ts` + `tests/` | Texto y codificación del enlace de WhatsApp | 6 |
| `components/store/PedidoConfirmado.tsx` + CSS | Instrucciones, tarjetas de banco, copiar, WhatsApp | 7 |
| `components/store/SubirComprobante.tsx` + CSS | Subida al bucket privado | 8 |
| `app/admin/pedidos/*` | Ver método, cuenta, referencia y comprobante | 8 |
| `lib/webhooks/evento.ts` + `tests/` | Sobre versionado y firma HMAC | 9 |
| `lib/webhooks/publicar.ts` | Envío que nunca bloquea | 10 |
| `app/api/pedidos/caducar/route.ts` | Cancelar vencidos y devolver stock | 11 |

---

## Task 1: Migración de configuración de pagos de la tienda

**Files:**
- Create: `supabase/migrations/2026-08-19-w1a-pagos-tienda.sql`
- Modify: `types/index.ts`

**Interfaces:**
- Consumes: nada.
- Produces: la columna `metodos_pago.visible_tienda`, la tabla `cuentas_bancarias`, y estos tipos en `types/index.ts`:

```ts
export interface CuentaBancaria {
  id: string
  banco: string
  tipo_cuenta: string
  numero: string
  titular: string
  activo: boolean
  orden: number
}
```
más `visible_tienda: boolean` añadido a `MetodoPago`.

**NO apliques la migración.** Se escribe y se commitea; la aplica el usuario.

- [ ] **Step 1: Escribir la migración**

Crea `supabase/migrations/2026-08-19-w1a-pagos-tienda.sql`:

```sql
-- W1a: qué métodos de pago se ofrecen en la tienda y a qué cuentas se transfiere.
--
-- No se crea un catálogo paralelo para la tienda: se marca sobre `metodos_pago`,
-- el mismo catálogo del POS. Así el método que el cliente declara es literalmente
-- el registro que después llevará el documento fiscal, sin traducción de por medio.

alter table metodos_pago
  add column if not exists visible_tienda boolean not null default false;

comment on column metodos_pago.visible_tienda is
  'Si el método se ofrece en el checkout de la tienda. Por defecto false: efectivo USD, crédito y saldo a favor no tienen sentido en línea.';

create table if not exists cuentas_bancarias (
  id          uuid primary key default gen_random_uuid(),
  banco       text not null,
  tipo_cuenta text not null,
  -- TEXTO, nunca numérico: los números de cuenta llevan ceros a la izquierda.
  numero      text not null,
  titular     text not null,
  activo      boolean not null default true,
  orden       integer not null default 0,
  created_at  timestamptz not null default now()
);

comment on column cuentas_bancarias.numero is
  'Texto a propósito: un numérico perdería los ceros a la izquierda.';

alter table cuentas_bancarias enable row level security;

-- La tienda (anon) solo lee las cuentas activas; el panel las administra.
create policy cuentas_bancarias_lectura_publica on cuentas_bancarias
  for select to anon, authenticated using (activo = true);

create policy cuentas_bancarias_admin on cuentas_bancarias
  for all to authenticated using (true) with check (true);
```

- [ ] **Step 2: Añadir los tipos**

En `types/index.ts`, añade `visible_tienda: boolean` a la interfaz `MetodoPago` (que hoy es `{ id, nombre, tipo, activo, orden }`), y añade después:

```ts
// W1a: cuentas a las que el cliente transfiere. El `numero` es texto porque
// los números de cuenta llevan ceros a la izquierda que un numérico perdería.
export interface CuentaBancaria {
  id: string
  banco: string
  tipo_cuenta: string
  numero: string
  titular: string
  activo: boolean
  orden: number
}
```

- [ ] **Step 3: Verificación**

Run: `npx tsc --noEmit` — Expected: sin salida.
Run: `npm test` — Expected: 46 archivos / 658 tests (esta tarea no añade tests).
Run: `npx eslint types` — Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026-08-19-w1a-pagos-tienda.sql types/index.ts
git commit -m "feat(tienda): migracion de metodos visibles en tienda y cuentas bancarias (W1a)"
```

---

## Task 2: Configuración de pagos de la tienda en el panel

**Files:**
- Create: `app/admin/configuracion/PagosTiendaSection.tsx`
- Create: `app/admin/configuracion/pagos-actions.ts`
- Create: `app/admin/configuracion/pagos-tienda.module.css`
- Modify: `app/admin/configuracion/page.tsx` (cargar métodos y cuentas)
- Modify: `app/admin/configuracion/ConfigClient.tsx` (montar la sección)

**Interfaces:**
- Consumes: `CuentaBancaria` y `MetodoPago.visible_tienda` (Task 1).
- Produces: estas Server Actions, que ninguna tarea posterior consume:

```ts
export async function guardarVisibilidadMetodo(metodoId: string, visible: boolean): Promise<{ ok: true } | { ok: false; error: string }>
export async function guardarCuentaBancaria(input: { id: string | null; banco: string; tipo_cuenta: string; numero: string; titular: string; activo: boolean; orden: number }): Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }>
export async function eliminarCuentaBancaria(id: string): Promise<{ ok: true } | { ok: false; error: string }>
```

**Antes de escribir nada, lee `app/admin/configuracion/ConfigClient.tsx` entero** y sigue el patrón de sus secciones existentes: cómo agrupa campos, cómo guarda y cómo muestra errores. No inventes un estilo nuevo.

- [ ] **Step 1: Las Server Actions**

Crea `app/admin/configuracion/pagos-actions.ts`:

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'

export type PagosResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }

const ERROR_GENERICO = 'No se pudo completar la operación. Intenta de nuevo.'

export async function guardarVisibilidadMetodo(metodoId: string, visible: boolean): Promise<PagosResult> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('metodos_pago')
    .update({ visible_tienda: visible })
    .eq('id', metodoId)
  if (error) return { ok: false, error: ERROR_GENERICO }
  revalidatePath('/admin/configuracion')
  return { ok: true }
}

export interface CuentaBancariaInput {
  id: string | null
  banco: string
  tipo_cuenta: string
  numero: string
  titular: string
  activo: boolean
  orden: number
}

export async function guardarCuentaBancaria(input: CuentaBancariaInput): Promise<PagosResult<{ id: string }>> {
  const banco = input.banco.trim()
  const numero = input.numero.trim()
  const titular = input.titular.trim()
  const tipoCuenta = input.tipo_cuenta.trim()
  if (!banco || !numero || !titular || !tipoCuenta) {
    return { ok: false, error: 'Banco, tipo de cuenta, número y titular son obligatorios.' }
  }

  const supabase = await createClient()
  const fila = { banco, tipo_cuenta: tipoCuenta, numero, titular, activo: input.activo, orden: input.orden }

  if (input.id) {
    const { error } = await supabase.from('cuentas_bancarias').update(fila).eq('id', input.id)
    if (error) return { ok: false, error: ERROR_GENERICO }
    revalidatePath('/admin/configuracion')
    return { ok: true, data: { id: input.id } }
  }

  const { data, error } = await supabase.from('cuentas_bancarias').insert(fila).select('id').single()
  if (error || !data) return { ok: false, error: ERROR_GENERICO }
  revalidatePath('/admin/configuracion')
  return { ok: true, data: { id: data.id } }
}

export async function eliminarCuentaBancaria(id: string): Promise<PagosResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('cuentas_bancarias').delete().eq('id', id)
  if (error) return { ok: false, error: ERROR_GENERICO }
  revalidatePath('/admin/configuracion')
  return { ok: true }
}
```

- [ ] **Step 2: La sección de interfaz**

Crea `PagosTiendaSection.tsx` como componente cliente con dos bloques:

**Bloque «Métodos visibles en la tienda»:** una casilla por cada método de `metodos_pago` con `activo = true`, mostrando su nombre, que llama a `guardarVisibilidadMetodo` al cambiar. Bajo la lista, esta nota:

> Solo los métodos marcados aparecen en el checkout de la tienda. Efectivo USD, Crédito y Saldo a favor son de mostrador y normalmente no se marcan.

**Bloque «Cuentas bancarias»:** tabla con banco, tipo de cuenta, número, titular, estado y acciones; botón «+ Nueva cuenta» que abre un modal (usa `@/components/admin/Modal`, el mismo que usan las demás pantallas) con los campos de `CuentaBancariaInput`. Editar y eliminar por fila, con confirmación antes de eliminar.

Bajo la tabla, esta nota:

> Estas cuentas se le muestran al cliente **después** de confirmar su pedido, con botón para copiar el número y el monto.

Todos los botones combinan la clase global con una clase de layout del módulo (`btnMerlinPrimary ${styles.btnAccion}`), nunca la global suelta.

- [ ] **Step 3: Cargar los datos y montar la sección**

En `app/admin/configuracion/page.tsx`, añade a las consultas que ya hace:

```ts
supabase.from('metodos_pago').select('*').eq('activo', true).order('orden'),
supabase.from('cuentas_bancarias').select('*').order('orden'),
```

y pásalos a `ConfigClient`, que a su vez los pasa a `PagosTiendaSection`.

- [ ] **Step 4: Verificación**

Run: `npx tsc --noEmit` — Expected: sin salida.
Run: `npm test` — Expected: 46 archivos / 658 tests.
Run: `npx eslint app/admin/configuracion` — Expected: sin errores.
Run: `npm run build` — Expected: build correcto.

- [ ] **Step 5: Comprobaciones funcionales**

`/admin` está detrás de Supabase Auth. **Si no logras autenticarte, dilo en el informe y no las des por hechas.** No inventes credenciales.

Requieren que la migración de la Task 1 esté aplicada; **si no lo está, dilo y no marques estos pasos como hechos**.

1. Marcar «Transferencia / Depósito» como visible en tienda y recargar: la marca persiste.
2. Crear una cuenta bancaria con número que empiece por cero (p. ej. `00002020850354`) y verificar que **conserva los ceros** al recargar.
3. Editarla y eliminarla.

- [ ] **Step 6: Commit**

```bash
git add app/admin/configuracion
git commit -m "feat(admin): configuracion de metodos visibles en tienda y cuentas bancarias (W1a)"
```

---

## Task 3: Migración del pedido — columnas, bucket y `crear_pedido` v3

**Files:**
- Create: `supabase/migrations/2026-08-19-w1a-pedido-pago.sql`
- Modify: `types/index.ts` (interfaz `Pedido`)

**Interfaces:**
- Consumes: `metodos_pago` y `cuentas_bancarias` (Task 1).
- Produces: las columnas nuevas de `pedidos` y la nueva firma de `crear_pedido`, que la Task 5 llama:

```
crear_pedido(
  p_nombre_cliente text, p_telefono text, p_ciudad text, p_envio_id uuid,
  p_envio_nombre text, p_cupon_codigo text, p_subtotal numeric,
  p_descuento_cupon numeric, p_costo_envio numeric, p_total numeric,
  p_notas text, p_items jsonb,
  p_email text, p_direccion text, p_metodo_pago_id uuid,
  p_cuenta_bancaria_id uuid, p_referencia_pago text, p_expira_at timestamptz
) returns table (id uuid, numero integer)
```

**Tres cosas que hay que entender antes de tocar el archivo:**

1. **La versión viva de `crear_pedido` está en `supabase/migrations/2026-08-07-pos-p2-rpcs.sql:267`.** Ábrela y **cópiala entera** como base: valida y descuenta stock (variantes y productos planos) en la misma transacción, y ese comportamiento **no puede cambiar**.
2. **Postgres sobrecarga por firma.** Añadir parámetros crea una función *distinta*, y con las dos vivas la llamada queda ambigua. Hay que **eliminar la firma vieja** explícitamente.
3. **Los parámetros nuevos van al final y con valor por defecto**, para que la RPC siga siendo llamable sin ellos durante el despliegue.

**NO apliques la migración.**

- [ ] **Step 1: Escribir la migración**

Crea `supabase/migrations/2026-08-19-w1a-pedido-pago.sql`. Empieza por las columnas y el bucket:

```sql
-- W1a: el pedido guarda cómo dijo pagar el cliente, sus datos de contacto
-- reales y cuándo caduca si nadie paga.

alter table pedidos
  add column if not exists metodo_pago_id      uuid references metodos_pago(id),
  add column if not exists cuenta_bancaria_id  uuid references cuentas_bancarias(id),
  add column if not exists referencia_pago     text,
  add column if not exists comprobante_url     text,
  -- El checkout exige un correo válido desde siempre y hasta ahora lo descartaba.
  add column if not exists email               text,
  -- Hasta ahora la dirección se guardaba dentro de `notas`, mezclada con
  -- cualquier otra anotación. Los pedidos viejos conservan su `notas` tal cual:
  -- separarlos a posteriori exigiría adivinar qué parte era dirección.
  add column if not exists direccion           text,
  add column if not exists expira_at           timestamptz;

create index if not exists pedidos_expira_at on pedidos (expira_at)
  where expira_at is not null;

-- Bucket PRIVADO: a diferencia de `banners`, un comprobante bancario lleva
-- datos personales del cliente. Se sirve con URL firmada de vigencia corta.
insert into storage.buckets (id, name, public)
values ('comprobantes', 'comprobantes', false)
on conflict (id) do nothing;

-- La tienda (anon) puede subir su comprobante, pero NO listar ni leer los de
-- otros: la lectura queda solo para el panel.
create policy comprobantes_subida_publica on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'comprobantes');

create policy comprobantes_lectura_panel on storage.objects
  for select to authenticated
  using (bucket_id = 'comprobantes');
```

- [ ] **Step 2: Reescribir `crear_pedido` en la misma migración**

Abre `supabase/migrations/2026-08-07-pos-p2-rpcs.sql` en la línea 267, copia el cuerpo completo de la función y añádelo a tu migración con los seis parámetros nuevos al final. **No cambies ni una línea de la validación y el descuento de stock.** El `insert into pedidos` gana las columnas nuevas:

```sql
-- Se elimina la firma anterior: con las dos vivas, la llamada sería ambigua.
drop function if exists crear_pedido(
  text, text, text, uuid, text, text, numeric, numeric, numeric, numeric, text, jsonb
);

create or replace function crear_pedido(
  p_nombre_cliente text,
  p_telefono text,
  p_ciudad text,
  p_envio_id uuid,
  p_envio_nombre text,
  p_cupon_codigo text,
  p_subtotal numeric,
  p_descuento_cupon numeric,
  p_costo_envio numeric,
  p_total numeric,
  p_notas text,
  p_items jsonb,
  p_email text default null,
  p_direccion text default null,
  p_metodo_pago_id uuid default null,
  p_cuenta_bancaria_id uuid default null,
  p_referencia_pago text default null,
  p_expira_at timestamptz default null
)
returns table (id uuid, numero integer)
language plpgsql
security definer
set search_path = public
as $$
-- ... CUERPO COPIADO LITERALMENTE de 2026-08-07-pos-p2-rpcs.sql:267,
-- con el `insert into pedidos` ampliado con las seis columnas nuevas.
$$;

grant execute on function crear_pedido(
  text, text, text, uuid, text, text, numeric, numeric, numeric, numeric, text, jsonb,
  text, text, uuid, uuid, text, timestamptz
) to anon, authenticated;
```

- [ ] **Step 3: Ampliar el tipo `Pedido`**

En `types/index.ts`, añade a la interfaz `Pedido`, después de `notas`:

```ts
  metodo_pago_id: string | null
  cuenta_bancaria_id: string | null
  referencia_pago: string | null
  comprobante_url: string | null
  email: string | null
  direccion: string | null
  expira_at: string | null
```

- [ ] **Step 4: Verificación**

Run: `npx tsc --noEmit` — Expected: sin salida.
Run: `npm test` — Expected: 46 archivos / 658 tests.
Run: `npx eslint types` — Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026-08-19-w1a-pedido-pago.sql types/index.ts
git commit -m "feat(tienda): migracion de pago declarado en pedidos y bucket privado de comprobantes (W1a)"
```

---

## Task 4: Reglas puras del pago declarado

**Files:**
- Create: `lib/tienda/pagos.ts`
- Create: `lib/tienda/tests/pagos.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:

```ts
export function metodoOfrecidoEnTienda(m: { activo: boolean; visible_tienda: boolean }): boolean
export function validarMetodoDeclarado(
  metodoId: string | null,
  metodos: Array<{ id: string; tipo: string; activo: boolean; visible_tienda: boolean }>,
): { ok: true; metodo: { id: string; tipo: string } } | { ok: false; error: string }
export function requiereCuentaBancaria(tipo: string): boolean
export function calcularExpiracion(ahora: Date, horas: number): Date
export function estaVencido(expiraAt: string | null, ahora: Date): boolean
```

La consumen la Task 5 (checkout) y la Task 11 (caducidad).

- [ ] **Step 1: Escribir los tests que fallan**

Crea `lib/tienda/tests/pagos.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  metodoOfrecidoEnTienda,
  validarMetodoDeclarado,
  requiereCuentaBancaria,
  calcularExpiracion,
  estaVencido,
} from '../pagos'

const metodo = (id: string, tipo: string, activo = true, visible = true) =>
  ({ id, tipo, activo, visible_tienda: visible })

describe('metodoOfrecidoEnTienda', () => {
  it('exige activo Y visible en tienda', () => {
    expect(metodoOfrecidoEnTienda({ activo: true, visible_tienda: true })).toBe(true)
    expect(metodoOfrecidoEnTienda({ activo: false, visible_tienda: true })).toBe(false)
    expect(metodoOfrecidoEnTienda({ activo: true, visible_tienda: false })).toBe(false)
  })
})

describe('validarMetodoDeclarado', () => {
  const catalogo = [metodo('a', 'transferencia'), metodo('b', 'tarjeta', true, false), metodo('c', 'efectivo_lps', false)]

  it('acepta un metodo activo y visible', () => {
    const r = validarMetodoDeclarado('a', catalogo)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.metodo.tipo).toBe('transferencia')
  })

  // El navegador puede mandar cualquier id: el que no esta en el catalogo
  // releido de la base no existe para el servidor.
  it('rechaza un id que no esta en el catalogo', () => {
    expect(validarMetodoDeclarado('zzz', catalogo).ok).toBe(false)
  })

  // Un metodo del POS que no se ofrece en linea (credito, saldo a favor) no
  // puede colarse forzando la peticion.
  it('rechaza un metodo que existe pero no es visible en tienda', () => {
    expect(validarMetodoDeclarado('b', catalogo).ok).toBe(false)
  })

  it('rechaza un metodo desactivado', () => {
    expect(validarMetodoDeclarado('c', catalogo).ok).toBe(false)
  })

  it('rechaza el id nulo', () => {
    expect(validarMetodoDeclarado(null, catalogo).ok).toBe(false)
  })
})

describe('requiereCuentaBancaria', () => {
  it('solo la transferencia necesita cuenta', () => {
    expect(requiereCuentaBancaria('transferencia')).toBe(true)
    expect(requiereCuentaBancaria('tarjeta')).toBe(false)
    expect(requiereCuentaBancaria('efectivo_lps')).toBe(false)
  })
})

describe('calcularExpiracion', () => {
  // Instantes absolutos, no dias de calendario: sumar horas a un instante no
  // depende de la zona horaria, y por eso no hay que corregir por Honduras.
  it('suma horas al instante dado', () => {
    const r = calcularExpiracion(new Date('2026-08-19T10:00:00Z'), 48)
    expect(r.toISOString()).toBe('2026-08-21T10:00:00.000Z')
  })

  it('acepta plazos que cruzan el cambio de dia', () => {
    const r = calcularExpiracion(new Date('2026-08-19T23:30:00Z'), 2)
    expect(r.toISOString()).toBe('2026-08-20T01:30:00.000Z')
  })
})

describe('estaVencido', () => {
  const ahora = new Date('2026-08-19T12:00:00Z')

  it('vencido si la fecha ya paso', () => {
    expect(estaVencido('2026-08-19T11:59:00Z', ahora)).toBe(true)
  })

  it('no vencido si aun falta', () => {
    expect(estaVencido('2026-08-19T12:01:00Z', ahora)).toBe(false)
  })

  // Sin fecha de caducidad el pedido NO vence: es el lado seguro. Cancelar un
  // pedido legitimo por un dato ausente devolveria stock de una venta real.
  it('sin fecha de caducidad nunca vence', () => {
    expect(estaVencido(null, ahora)).toBe(false)
  })
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run lib/tienda/tests/pagos.test.ts`
Expected: FAIL — el módulo `../pagos` no existe.

- [ ] **Step 3: Implementar**

Crea `lib/tienda/pagos.ts`:

```ts
/**
 * Reglas del pago que el cliente declara en el checkout.
 *
 * Viven aquí y no en la Server Action porque la pantalla y el servidor tienen
 * que aplicar exactamente el mismo criterio: la tienda decide qué botones
 * pinta, el servidor decide qué acepta, y si divergen se puede colar un
 * método que no debía ofrecerse.
 */

export function metodoOfrecidoEnTienda(m: { activo: boolean; visible_tienda: boolean }): boolean {
  return m.activo && m.visible_tienda
}

/**
 * Valida el método que declaró el navegador contra el catálogo releído de la
 * base. **Frontera de confianza**: el navegador puede mandar cualquier id —
 * incluido el de un método de mostrador como Crédito o Saldo a favor — y solo
 * cuenta lo que el catálogo dice.
 */
export function validarMetodoDeclarado(
  metodoId: string | null,
  metodos: Array<{ id: string; tipo: string; activo: boolean; visible_tienda: boolean }>,
): { ok: true; metodo: { id: string; tipo: string } } | { ok: false; error: string } {
  if (!metodoId) return { ok: false, error: 'Selecciona un método de pago.' }
  const encontrado = metodos.find(m => m.id === metodoId)
  if (!encontrado || !metodoOfrecidoEnTienda(encontrado)) {
    return { ok: false, error: 'El método de pago seleccionado no está disponible.' }
  }
  return { ok: true, metodo: { id: encontrado.id, tipo: encontrado.tipo } }
}

export function requiereCuentaBancaria(tipo: string): boolean {
  return tipo === 'transferencia'
}

/**
 * Cuándo caduca un pedido sin pagar. Se trabaja con **instantes absolutos**,
 * no con días de calendario: sumar horas no depende de la zona horaria, así
 * que aquí no hace falta la corrección de Honduras que sí necesitan las
 * fechas que se muestran.
 */
export function calcularExpiracion(ahora: Date, horas: number): Date {
  return new Date(ahora.getTime() + horas * 60 * 60 * 1000)
}

/**
 * Sin fecha de caducidad un pedido NUNCA vence. Es deliberado y es el lado
 * seguro: cancelar por un dato ausente devolvería el stock de una venta real.
 */
export function estaVencido(expiraAt: string | null, ahora: Date): boolean {
  if (!expiraAt) return false
  return new Date(expiraAt).getTime() <= ahora.getTime()
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx vitest run lib/tienda/tests/pagos.test.ts`
Expected: PASS — 13 tests.

- [ ] **Step 5: Verificación completa**

Run: `npx tsc --noEmit` — Expected: sin salida.
Run: `npm test` — Expected: 47 archivos / 671 tests (658 + 13, y un archivo de test nuevo).
Run: `npx eslint lib/tienda` — Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add lib/tienda/pagos.ts lib/tienda/tests/pagos.test.ts
git commit -m "feat(tienda): reglas puras del pago declarado y la caducidad (W1a)"
```

---

## Task 5: El método de pago en el checkout

**Files:**
- Modify: `app/(store)/checkout/actions.ts`
- Modify: `components/store/CheckoutModal.tsx`
- Modify: `components/store/CheckoutModal.module.css`
- Modify: `app/(store)/StoreClient.tsx` (pasar métodos y cuentas)
- Modify: `app/(store)/layout.tsx` o `app/(store)/page.tsx` (cargar métodos)

**Interfaces:**
- Consumes: `validarMetodoDeclarado`, `requiereCuentaBancaria`, `calcularExpiracion` de `lib/tienda/pagos.ts` (Task 4); la firma nueva de `crear_pedido` (Task 3).
- Produces: `CrearPedidoResult` ampliado, que la Task 7 consume:

```ts
export interface CrearPedidoResult {
  pedidoId?: string
  numero?: number
  error?: string
}
```
(sin cambios de forma; lo que cambia es que el pedido queda con método declarado).

**El honeypot va en esta tarea** porque es un campo del mismo formulario.

- [ ] **Step 1: Ampliar el esquema y la validación de la acción**

En `app/(store)/checkout/actions.ts`, amplía `crearPedidoSchema`:

```ts
const crearPedidoSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido'),
  telefono: z.string().min(1, 'El teléfono es requerido'),
  email: z.string().email('Correo inválido'),
  ciudad: z.string().optional().default(''),
  direccion: z.string().optional().default(''),
  envioId: z.string().uuid().nullable(),
  cuponCodigo: z.string().nullable(),
  cart: z.array(cartItemSchema).min(1, 'El carrito está vacío'),
  metodoPagoId: z.string().uuid({ message: 'Selecciona un método de pago.' }),
  cuentaBancariaId: z.string().uuid().nullable().optional().default(null),
  referenciaPago: z.string().max(120).optional().default(''),
  // Campo trampa: invisible en pantalla, una persona nunca lo rellena.
  // Si viene con contenido, es un bot.
  sitioWeb: z.string().max(0).optional().default(''),
})
```

Y añade los imports:

```ts
import { validarMetodoDeclarado, requiereCuentaBancaria, calcularExpiracion } from '@/lib/tienda/pagos'
```

- [ ] **Step 2: Frontera de confianza y límite de frecuencia**

Dentro de `crearPedido`, después de `const supabase = await createClient()` y **antes** de leer productos, añade:

```ts
  // Campo trampa. Se responde con el error genérico a propósito: decirle a un
  // bot que cayó en la trampa solo le enseña a evitarla.
  if (parsed.data.sitioWeb) return { error: GENERIC_ERROR }

  // Límite de frecuencia por teléfono. Frena el doble envío accidental y el
  // juego deliberado. Cuenta contra la base porque en serverless no hay
  // memoria compartida entre invocaciones.
  const desde = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { count: recientes } = await supabase
    .from('pedidos')
    .select('id', { count: 'exact', head: true })
    .eq('telefono', telefono)
    .gte('created_at', desde)
  if ((recientes ?? 0) >= 3) {
    return { error: 'Ya registraste varios pedidos hace un momento. Espera unos minutos o escríbenos por WhatsApp.' }
  }

  // FRONTERA DE CONFIANZA: el método se relee de la base. El navegador puede
  // mandar el id de un método de mostrador (Crédito, Saldo a favor) que no se
  // ofrece en línea; solo cuenta lo que dice el catálogo.
  const { data: metodosRows, error: metodosError } = await supabase
    .from('metodos_pago')
    .select('id, tipo, activo, visible_tienda')
  if (metodosError) return { error: GENERIC_ERROR }

  const metodoValido = validarMetodoDeclarado(parsed.data.metodoPagoId, metodosRows ?? [])
  if (!metodoValido.ok) return { error: metodoValido.error }

  // La cuenta bancaria solo se guarda si el método es de transferencia y la
  // cuenta existe y está activa. Una cuenta inventada no viaja al pedido.
  let cuentaBancariaId: string | null = null
  if (requiereCuentaBancaria(metodoValido.metodo.tipo) && parsed.data.cuentaBancariaId) {
    const { data: cuenta } = await supabase
      .from('cuentas_bancarias')
      .select('id')
      .eq('id', parsed.data.cuentaBancariaId)
      .eq('activo', true)
      .maybeSingle()
    cuentaBancariaId = cuenta?.id ?? null
  }
```

- [ ] **Step 3: Pasar los datos nuevos a la RPC**

Amplía la llamada `.rpc('crear_pedido', { ... })` con los seis parámetros nuevos:

```ts
      p_email: parsed.data.email,
      p_direccion: envio?.tipo === 'delivery' ? direccion : null,
      p_metodo_pago_id: metodoValido.metodo.id,
      p_cuenta_bancaria_id: cuentaBancariaId,
      p_referencia_pago: parsed.data.referenciaPago.trim() || null,
      p_expira_at: calcularExpiracion(new Date(), horasCaducidad).toISOString(),
```

donde `horasCaducidad` se lee de `configuracion` con la clave `pedido_horas_caducidad`, con 48 por defecto:

```ts
  const { data: configRows } = await supabase.from('configuracion').select('key, value')
  const config = toConfigMap(configRows ?? [])
  const horasCaducidad = Number(config.pedido_horas_caducidad) > 0
    ? Number(config.pedido_horas_caducidad)
    : 48
```

`toConfigMap` ya está importado en este archivo.

- [ ] **Step 4: El bloque de método de pago en el formulario**

En `CheckoutModal.tsx`, añade un bloque **antes** del botón de confirmar:

- Título «Método de pago».
- Una opción por cada método recibido en props (ya filtrados por el servidor), como tarjetas seleccionables, no un `<select>`: son pocas y se tocan con el pulgar.
- Si el método elegido es de tipo `transferencia`, un selector de cuenta **opcional** con el texto «¿A qué cuenta transferirás? (opcional)», y un campo de referencia opcional con la etiqueta «Número de referencia (si ya transferiste)».
- **No se muestran los datos bancarios aquí.** Aparecen tras confirmar, en la Task 7. Si algún implementador siente la tentación de adelantarlos, el motivo de no hacerlo está en el spec: si se muestran antes, alguien transfiere y cierra la pestaña, y llega dinero sin pedido detrás.

Añade también el campo trampa, invisible pero **no** con `display: none` (algunos bots lo detectan):

```tsx
{/* Campo trampa contra bots: fuera de la pantalla y fuera del recorrido de
    tabulación. Una persona nunca lo ve ni lo rellena. */}
<input
  type="text"
  name="sitioWeb"
  value={sitioWeb}
  onChange={e => setSitioWeb(e.target.value)}
  className={styles.campoTrampa}
  tabIndex={-1}
  autoComplete="off"
  aria-hidden="true"
/>
```

con este CSS en `CheckoutModal.module.css`:

```css
/* Campo trampa: invisible para una persona pero presente en el DOM. No se usa
   `display: none` porque algunos bots lo detectan y saltan el campo. */
.campoTrampa {
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
  opacity: 0;
}
```

Y pásalos en la llamada a `crearPedido`.

- [ ] **Step 5: Cargar métodos y cuentas en la tienda**

Donde `app/(store)` carga los datos de la tienda, añade la lectura de métodos visibles y cuentas activas, y pásalos hasta `CheckoutModal`:

```ts
supabase.from('metodos_pago').select('id, nombre, tipo, orden').eq('activo', true).eq('visible_tienda', true).order('orden'),
supabase.from('cuentas_bancarias').select('*').eq('activo', true).order('orden'),
```

- [ ] **Step 6: Verificación**

Run: `npx tsc --noEmit` — Expected: sin salida.
Run: `npm test` — Expected: 47 archivos / 671 tests.
Run: `npx eslint "app/(store)" components/store` — Expected: sin errores.
Run: `npm run build` — Expected: build correcto.

- [ ] **Step 7: Comprobaciones funcionales**

Requieren las migraciones de las Tasks 1 y 3 aplicadas. **Si no lo están, dilo y no las des por hechas.**

1. Comprar con transferencia: el pedido se crea y guarda `metodo_pago_id`.
2. Comprar sin elegir método: no deja continuar.
3. **Forzar la petición con el id de un método no visible en tienda** (por ejemplo «Crédito»): la acción la rechaza.
4. El correo y la dirección quedan guardados en sus columnas.

- [ ] **Step 8: Commit**

```bash
git add "app/(store)" components/store
git commit -m "feat(tienda): metodo de pago declarado en el checkout con frontera de confianza (W1a)"
```

---

## Task 6: El texto del enlace de WhatsApp

**Files:**
- Create: `lib/store/whatsapp.ts`
- Create: `lib/store/tests/whatsapp.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:

```ts
export function textoComprobanteWhatsApp(datos: {
  nombre: string
  numeroPedido: number
  monto: number
}): string
export function enlaceWhatsApp(numeroTienda: string, texto: string): string
```

La consume la Task 7.

**Dos defectos concretos que esta tarea existe para evitar**, observados en una implementación ajena del mismo botón: el texto se codificó a trozos y un emoji salió como `�`, y el mensaje citaba un monto distinto del que la pantalla pedía transferir.

- [ ] **Step 1: Escribir los tests que fallan**

Crea `lib/store/tests/whatsapp.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { textoComprobanteWhatsApp, enlaceWhatsApp } from '../whatsapp'

describe('textoComprobanteWhatsApp', () => {
  const base = { nombre: 'Ana Pérez', numeroPedido: 42, monto: 1039 }

  it('cita el numero de pedido y el monto', () => {
    const t = textoComprobanteWhatsApp(base)
    expect(t).toContain('42')
    expect(t).toContain('L. 1,039.00')
  })

  it('incluye el nombre del cliente', () => {
    expect(textoComprobanteWhatsApp(base)).toContain('Ana Pérez')
  })
})

describe('enlaceWhatsApp', () => {
  // El texto se codifica ENTERO de una vez. Codificar a trozos, o concatenar
  // partes ya codificadas, es como se pierde un emoji y sale "?" en el chat.
  it('codifica el texto completo, incluidos acentos y emoji', () => {
    const url = enlaceWhatsApp('50499999999', 'Hola 👋 soy Ana Pérez')
    expect(url).toContain('phone=50499999999')
    expect(url).toContain(encodeURIComponent('Hola 👋 soy Ana Pérez'))
    expect(url).not.toContain('�')
  })

  it('el texto decodificado es identico al original', () => {
    const original = 'Pedido *42* por L. 1,039.00 ✅'
    const url = enlaceWhatsApp('50499999999', original)
    const texto = new URL(url).searchParams.get('text')
    expect(texto).toBe(original)
  })

  // Los numeros hondureños se escriben de muchas formas; el enlace necesita
  // solo digitos o WhatsApp no lo abre.
  it('limpia el numero de la tienda dejando solo digitos', () => {
    expect(enlaceWhatsApp('+504 9999-9999', 'hola')).toContain('phone=50499999999')
  })
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run lib/store/tests/whatsapp.test.ts`
Expected: FAIL — el módulo `../whatsapp` no existe.

- [ ] **Step 3: Implementar**

Crea `lib/store/whatsapp.ts`:

```ts
import { formatPrice } from './format'

/**
 * Mensaje que el cliente envía a la tienda junto con su comprobante.
 *
 * El monto es el que la pantalla le pidió transferir, **el mismo**: un mensaje
 * que cita una cifra distinta de la que muestra la tarjeta bancaria obliga a
 * la tienda a averiguar cuál vale.
 */
export function textoComprobanteWhatsApp(datos: {
  nombre: string
  numeroPedido: number
  monto: number
}): string {
  return (
    `Hola, soy ${datos.nombre}. Te comparto el comprobante de mi pedido ` +
    `*#${datos.numeroPedido}* por un monto de *${formatPrice(datos.monto)}*.`
  )
}

/**
 * Enlace de WhatsApp con el mensaje prerrellenado.
 *
 * El texto se codifica **entero y de una sola vez**. Codificarlo a trozos, o
 * concatenar partes ya codificadas, es como se rompe un emoji y acaba
 * apareciendo un `?` en el chat.
 *
 * El número se limpia a dígitos porque se escribe de muchas formas
 * (`+504 9999-9999`) y WhatsApp solo abre el enlace con dígitos.
 */
export function enlaceWhatsApp(numeroTienda: string, texto: string): string {
  const numero = numeroTienda.replace(/\D/g, '')
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx vitest run lib/store/tests/whatsapp.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Verificación completa**

Run: `npx tsc --noEmit` — Expected: sin salida.
Run: `npm test` — Expected: 48 archivos / 677 tests.
Run: `npx eslint lib/store` — Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add lib/store/whatsapp.ts lib/store/tests/whatsapp.test.ts
git commit -m "feat(tienda): texto y enlace de WhatsApp con codificacion integra (W1a)"
```

---

## Task 7: Pantalla de pedido confirmado

**Files:**
- Create: `components/store/PedidoConfirmado.tsx`
- Create: `components/store/PedidoConfirmado.module.css`
- Modify: `components/store/CheckoutModal.tsx` (mostrarla tras confirmar)

**Interfaces:**
- Consumes: `textoComprobanteWhatsApp` y `enlaceWhatsApp` (Task 6); `CuentaBancaria` (Task 1).
- Produces: el componente `PedidoConfirmado`, que la Task 8 amplía con la subida:

```tsx
interface Props {
  numeroPedido: number
  nombreCliente: string
  total: number
  metodoNombre: string
  metodoTipo: string
  cuentas: CuentaBancaria[]
  whatsappTienda: string
  pedidoId: string
}
```

- [ ] **Step 1: La pantalla**

Crea `PedidoConfirmado.tsx` con esta estructura, en este orden:

1. **Encabezado**: «¡Pedido confirmado!» y el número, grande y copiable a ojo: `Pedido #42`.
2. **Resumen**: total, método de pago y, si aplica, la cuenta elegida.
3. **Instrucciones numeradas**, solo cuando el método es de tipo `transferencia`:
   1. Realiza la transferencia de **{total}** a cualquiera de las cuentas de abajo.
   2. Guarda tu comprobante de pago.
   3. Súbelo aquí o envíanoslo por WhatsApp citando tu número de pedido.
   4. Confirmamos tu pedido en cuanto verifiquemos el pago.
4. **Una tarjeta por cuenta bancaria activa** (bloque siguiente).
5. Hueco para el botón de subir comprobante — lo monta la Task 8.
6. **Botón de compartir por WhatsApp**, usando `enlaceWhatsApp(whatsappTienda, textoComprobanteWhatsApp({...}))`.

- [ ] **Step 2: Las tarjetas de banco con los botones de copiar**

Cada tarjeta muestra, en este orden: banco y tipo de cuenta como encabezado; luego **titular**, **número de cuenta** y **monto a transferir** como pares etiqueta/valor.

**Los botones de copiar van SOLO en el número de cuenta y en el monto.** No en el titular: ese dato se lee para verificar, no se pega. Son los dos campos que el cliente pega en la app de su banco.

```tsx
function BotonCopiar({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // `navigator.clipboard` no existe fuera de contexto seguro ni en
      // navegadores viejos. Se avisa en vez de fallar en silencio: el número
      // sigue visible y el cliente puede seleccionarlo a mano.
      setCopiado(false)
      alert('No se pudo copiar. Selecciona el texto y cópialo manualmente.')
    }
  }

  return (
    <button
      type="button"
      className={styles.btnCopiar}
      onClick={copiar}
      aria-label={copiado ? `${etiqueta} copiado` : `Copiar ${etiqueta}`}
    >
      {copiado ? '✓' : '⧉'}
      <span className={styles.copiarTexto}>{copiado ? 'Copiado' : 'Copiar'}</span>
    </button>
  )
}
```

**El monto se repite dentro de cada tarjeta** para que el cliente no tenga que buscarlo arriba ni calcular nada.

- [ ] **Step 3: Los estilos**

En `PedidoConfirmado.module.css`, define la caja del botón de copiar por completo: las clases `btnMerlin*` no traen padding ni display.

```css
/* Las clases globales btnMerlin* solo aportan color, radio y tipografía —
   sin padding ni display —, así que este control define su propia caja o se
   pinta como texto suelto. */
.btnCopiar {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.6rem;
  min-height: 34px;
  background: none;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-input);
  color: var(--text-muted);
  font-size: 0.78rem;
  cursor: pointer;
}
.btnCopiar:hover { color: var(--text); border-color: var(--border); }
```

Las tarjetas de banco y las instrucciones usan tokens Merlin; nada hardcodeado que ya tenga token.

- [ ] **Step 4: Mostrarla tras confirmar**

En `CheckoutModal.tsx`, sustituye el comportamiento actual (que abre `wa.me` y cierra el modal, líneas ~224-240) por: guardar el resultado del pedido en estado y renderizar `PedidoConfirmado`. **El carrito se vacía igual que ahora**, pero el modal no se cierra solo: el cliente necesita ver los datos bancarios.

- [ ] **Step 5: Verificación**

Run: `npx tsc --noEmit` — Expected: sin salida.
Run: `npm test` — Expected: 48 archivos / 677 tests.
Run: `npx eslint components/store` — Expected: sin errores.
Run: `npm run build` — Expected: build correcto.

- [ ] **Step 6: Comprobaciones funcionales**

1. Completar un pedido con transferencia: aparecen las instrucciones y las tarjetas.
2. Pulsar copiar en el número: el portapapeles trae el número **con sus ceros a la izquierda**.
3. Pulsar copiar en el monto y comprobar que trae la cifra.
4. El botón de WhatsApp abre el chat con el texto correcto y **sin caracteres rotos**.
5. Con un método que no es transferencia, no aparecen instrucciones ni tarjetas.

- [ ] **Step 7: Commit**

```bash
git add components/store
git commit -m "feat(tienda): pantalla de pedido confirmado con datos bancarios copiables (W1a)"
```

---

## Task 8: Subir el comprobante y verlo en el panel

**Files:**
- Create: `components/store/SubirComprobante.tsx`
- Create: `components/store/SubirComprobante.module.css`
- Create: `app/(store)/checkout/comprobante-actions.ts`
- Modify: `components/store/PedidoConfirmado.tsx` (montarlo)
- Modify: `app/admin/pedidos/page.tsx` y `PedidosClient.tsx` (mostrarlo)

**Interfaces:**
- Consumes: `PedidoConfirmado` (Task 7); el bucket `comprobantes` y `pedidos.comprobante_url` (Task 3).
- Produces:

```ts
export async function guardarComprobante(pedidoId: string, ruta: string): Promise<{ ok: true } | { ok: false; error: string }>
export async function urlFirmadaComprobante(ruta: string): Promise<string | null>
```

**El bucket es privado.** El cliente sube pero no lee; el panel lee con URL firmada.

- [ ] **Step 1: Las Server Actions**

Crea `app/(store)/checkout/comprobante-actions.ts`:

```ts
'use server'
import { createClient } from '@/lib/supabase-server'

export type ComprobanteResult = { ok: true } | { ok: false; error: string }

/**
 * Asocia el archivo ya subido al pedido. Se guarda la RUTA dentro del bucket,
 * no una URL pública: el bucket es privado y las URL de lectura se firman al
 * momento de mirarlas.
 */
export async function guardarComprobante(pedidoId: string, ruta: string): Promise<ComprobanteResult> {
  if (!ruta.startsWith(`${pedidoId}/`)) {
    return { ok: false, error: 'El comprobante no corresponde a este pedido.' }
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('adjuntar_comprobante', {
    p_pedido_id: pedidoId,
    p_ruta: ruta,
  })
  if (error) return { ok: false, error: 'No se pudo guardar el comprobante.' }
  return { ok: true }
}

/** URL de lectura de vigencia corta, solo para el panel. */
export async function urlFirmadaComprobante(ruta: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase.storage.from('comprobantes').createSignedUrl(ruta, 60 * 10)
  return data?.signedUrl ?? null
}
```

Añade la RPC a la migración de la Task 3 — el cliente de la tienda es anónimo y `pedidos` no tiene política de UPDATE pública, así que la escritura pasa por una función `SECURITY DEFINER` que solo puede tocar esa columna:

```sql
-- El cliente anónimo adjunta su comprobante sin poder tocar nada más del
-- pedido: la función solo escribe `comprobante_url`, y solo si el pedido
-- todavía no tiene uno (para que nadie sobrescriba el de otro).
create or replace function adjuntar_comprobante(p_pedido_id uuid, p_ruta text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update pedidos
     set comprobante_url = p_ruta,
         updated_at = now()
   where id = p_pedido_id
     and comprobante_url is null;
end;
$$;

grant execute on function adjuntar_comprobante(uuid, text) to anon, authenticated;
```

- [ ] **Step 2: El componente de subida**

Crea `SubirComprobante.tsx`, siguiendo el patrón de `components/admin/ImageUpload.tsx` pero con tres diferencias que hay que respetar:

- La ruta se construye como `${pedidoId}/${Date.now()}.${ext}` — el prefijo es lo que valida `guardarComprobante`.
- Acepta imagen y PDF: `accept="image/*,application/pdf"`.
- **No llama a `getPublicUrl`**: el bucket es privado. Tras subir, llama a `guardarComprobante(pedidoId, ruta)`.

Rechaza archivos de más de 5 MB con un mensaje claro antes de intentar subirlos, y muestra los tres estados: subiendo, subido y error.

- [ ] **Step 3: Mostrarlo en la pantalla de confirmación**

Monta `SubirComprobante` en `PedidoConfirmado`, en el hueco que la Task 7 dejó, bajo las tarjetas de banco. Cuando la subida termina, sustituye el botón por «Comprobante recibido ✓» y una nota de que la tienda lo verificará.

- [ ] **Step 4: Verlo en el panel**

En `/admin/pedidos`, cada pedido muestra el bloque «Pago declarado» con método, cuenta, referencia y el comprobante. El comprobante se abre en pestaña nueva con la URL firmada que devuelve `urlFirmadaComprobante`. Si el pedido no tiene comprobante, se dice: «Sin comprobante subido».

- [ ] **Step 5: Verificación**

Run: `npx tsc --noEmit` — Expected: sin salida.
Run: `npm test` — Expected: 48 archivos / 677 tests.
Run: `npx eslint components/store "app/(store)" app/admin/pedidos` — Expected: sin errores.
Run: `npm run build` — Expected: build correcto.

- [ ] **Step 6: Comprobaciones funcionales**

1. Subir una imagen desde la pantalla de confirmación y verla en `/admin/pedidos`.
2. Subir un PDF.
3. Intentar subir un archivo de más de 5 MB: se rechaza antes de subir.
4. **Comprobar que el bucket no es público**: pedir la URL directa del objeto sin firmar devuelve error.

- [ ] **Step 7: Commit**

```bash
git add components/store "app/(store)" app/admin/pedidos supabase/migrations
git commit -m "feat(tienda): subida de comprobante a bucket privado y su vista en el panel (W1a)"
```

---

## Task 9: El sobre del evento y su firma

**Files:**
- Create: `lib/webhooks/evento.ts`
- Create: `lib/webhooks/tests/evento.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:

```ts
export interface SobreEvento<T = unknown> {
  evento: string
  version: number
  emitido_en: string
  datos: T
}
export function construirSobre<T>(evento: string, datos: T, emitidoEn: Date): SobreEvento<T>
export function firmarCuerpo(cuerpo: string, secreto: string): string
export function firmaValida(cuerpo: string, secreto: string, firma: string): boolean
```

La consumen la Task 10 (publicar) y la Task 11 (verificar la ruta de caducidad).

- [ ] **Step 1: Escribir los tests que fallan**

Crea `lib/webhooks/tests/evento.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { construirSobre, firmarCuerpo, firmaValida } from '../evento'

describe('construirSobre', () => {
  it('lleva evento, version, instante y datos', () => {
    const s = construirSobre('pedido.creado', { id: 'abc' }, new Date('2026-08-19T10:00:00Z'))
    expect(s.evento).toBe('pedido.creado')
    expect(s.version).toBe(1)
    expect(s.emitido_en).toBe('2026-08-19T10:00:00.000Z')
    expect(s.datos).toEqual({ id: 'abc' })
  })
})

describe('firmarCuerpo', () => {
  it('es estable para el mismo cuerpo y secreto', () => {
    expect(firmarCuerpo('{"a":1}', 's3cr3to')).toBe(firmarCuerpo('{"a":1}', 's3cr3to'))
  })

  it('cambia si cambia el cuerpo', () => {
    expect(firmarCuerpo('{"a":1}', 's3cr3to')).not.toBe(firmarCuerpo('{"a":2}', 's3cr3to'))
  })

  it('cambia si cambia el secreto', () => {
    expect(firmarCuerpo('{"a":1}', 'uno')).not.toBe(firmarCuerpo('{"a":1}', 'dos'))
  })
})

describe('firmaValida', () => {
  it('acepta la firma correcta', () => {
    const f = firmarCuerpo('{"a":1}', 's3cr3to')
    expect(firmaValida('{"a":1}', 's3cr3to', f)).toBe(true)
  })

  it('rechaza una firma de otro cuerpo', () => {
    const f = firmarCuerpo('{"a":2}', 's3cr3to')
    expect(firmaValida('{"a":1}', 's3cr3to', f)).toBe(false)
  })

  // Una firma vacia o ausente no puede pasar por buena: es justo lo que
  // mandaria quien no conoce el secreto.
  it('rechaza una firma vacia', () => {
    expect(firmaValida('{"a":1}', 's3cr3to', '')).toBe(false)
  })

  // Comparar longitudes distintas no debe reventar: timingSafeEqual exige
  // buffers del mismo tamaño y lanza si no lo son.
  it('rechaza una firma de otra longitud sin lanzar', () => {
    expect(() => firmaValida('{"a":1}', 's3cr3to', 'corta')).not.toThrow()
    expect(firmaValida('{"a":1}', 's3cr3to', 'corta')).toBe(false)
  })
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run lib/webhooks/tests/evento.test.ts`
Expected: FAIL — el módulo `../evento` no existe.

- [ ] **Step 3: Implementar**

Crea `lib/webhooks/evento.ts`:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Sobre común de todos los eventos que la aplicación publica hacia n8n.
 *
 * Es genérico y versionado a propósito: las olas siguientes (W2 y W3) añaden
 * tipos de evento sin rediseñar el contrato, y `version` permite cambiar la
 * forma de `datos` sin romper un flujo de n8n ya montado.
 */
export interface SobreEvento<T = unknown> {
  evento: string
  version: number
  emitido_en: string
  datos: T
}

export function construirSobre<T>(evento: string, datos: T, emitidoEn: Date): SobreEvento<T> {
  return { evento, version: 1, emitido_en: emitidoEn.toISOString(), datos }
}

/**
 * Firma HMAC-SHA256 del cuerpo, en hexadecimal. n8n la verifica para saber
 * que el evento salió de la aplicación y no de cualquiera que conozca la URL
 * del webhook.
 */
export function firmarCuerpo(cuerpo: string, secreto: string): string {
  return createHmac('sha256', secreto).update(cuerpo, 'utf8').digest('hex')
}

/**
 * Comparación en tiempo constante. `timingSafeEqual` **lanza** si los buffers
 * tienen distinta longitud, así que la longitud se comprueba antes: una firma
 * corta o vacía es exactamente lo que mandaría quien no conoce el secreto.
 */
export function firmaValida(cuerpo: string, secreto: string, firma: string): boolean {
  const esperada = Buffer.from(firmarCuerpo(cuerpo, secreto), 'utf8')
  const recibida = Buffer.from(firma, 'utf8')
  if (esperada.length !== recibida.length) return false
  return timingSafeEqual(esperada, recibida)
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx vitest run lib/webhooks/tests/evento.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 5: Verificación completa**

Run: `npx tsc --noEmit` — Expected: sin salida.
Run: `npm test` — Expected: 49 archivos / 686 tests.
Run: `npx eslint lib/webhooks` — Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add lib/webhooks/evento.ts lib/webhooks/tests/evento.test.ts
git commit -m "feat(webhooks): sobre versionado y firma HMAC de eventos (W1a)"
```

---

## Task 10: Publicar `pedido.creado` sin bloquear la venta

**Files:**
- Create: `lib/webhooks/publicar.ts`
- Modify: `app/(store)/checkout/actions.ts`
- Modify: `.env.example` (si existe; si no, créalo)

**Interfaces:**
- Consumes: `construirSobre` y `firmarCuerpo` de `lib/webhooks/evento.ts` (Task 9).
- Produces:

```ts
export async function publicarEvento(evento: string, datos: unknown): Promise<void>
```

Nunca lanza. La consume la Task 5 (checkout, ya escrita) y la usarán W2 y W3.

**Esta es la regla que gobierna la tarea: un aviso caído no puede costar una venta.** Todo fallo se traga y se registra.

- [ ] **Step 1: Implementar el publicador**

Crea `lib/webhooks/publicar.ts`:

```ts
import { construirSobre, firmarCuerpo } from './evento'

const TIEMPO_MAXIMO_MS = 4000

/**
 * Publica un evento hacia el webhook de n8n, que dispara el flujo de WhatsApp
 * por Evolution API.
 *
 * **Nunca lanza y nunca bloquea la venta.** Si el webhook falla, tarda o no
 * está configurado, se registra y se sigue: un aviso caído no puede costar un
 * pedido. Por eso tampoco reintenta aquí — reintentar dentro de la petición
 * del checkout alargaría la espera del cliente. Los reintentos son
 * responsabilidad del flujo de n8n.
 *
 * Si falta `N8N_WEBHOOK_URL` no hace nada, en silencio: así el entorno de
 * desarrollo no necesita n8n levantado.
 */
export async function publicarEvento(evento: string, datos: unknown): Promise<void> {
  const url = process.env.N8N_WEBHOOK_URL
  const secreto = process.env.N8N_WEBHOOK_SECRET
  if (!url) return

  try {
    const cuerpo = JSON.stringify(construirSobre(evento, datos, new Date()))
    const cabeceras: Record<string, string> = { 'Content-Type': 'application/json' }
    if (secreto) cabeceras['X-Hondusport-Firma'] = firmarCuerpo(cuerpo, secreto)

    const control = AbortSignal.timeout(TIEMPO_MAXIMO_MS)
    const res = await fetch(url, { method: 'POST', headers: cabeceras, body: cuerpo, signal: control })
    if (!res.ok) {
      console.error(`publicarEvento: ${evento} respondio ${res.status}`)
    }
  } catch (e) {
    console.error(`publicarEvento: fallo al publicar ${evento}`, e)
  }
}
```

- [ ] **Step 2: Publicar el evento al crear el pedido**

En `app/(store)/checkout/actions.ts`, justo antes del `return { pedidoId: data.id, numero: data.numero }` final:

```ts
  // El aviso va DESPUÉS de que el pedido exista y no condiciona el retorno:
  // publicarEvento no lanza nunca.
  await publicarEvento('pedido.creado', {
    pedido_id: data.id,
    numero: data.numero,
    cliente: { nombre, telefono, email: parsed.data.email },
    total: totals.total,
    metodo_pago: metodoValido.metodo.tipo,
    referencia_pago: parsed.data.referenciaPago.trim() || null,
    expira_at: expiraAt,
    items: items.map(i => ({ nombre: i.nombre_producto, cantidad: i.cantidad })),
  })
```

donde `expiraAt` es la misma cadena ISO que se pasó a la RPC (extráela a una variable en el Step 3 de la Task 5 si aún no lo está).

Añade el import: `import { publicarEvento } from '@/lib/webhooks/publicar'`.

- [ ] **Step 3: Documentar las variables**

Añade a `.env.example` (créalo si no existe):

```
# Webhook de n8n que dispara el flujo de WhatsApp (Evolution API).
# Si se deja vacío, la aplicación funciona igual y no publica eventos.
N8N_WEBHOOK_URL=
# Secreto compartido con n8n para firmar los eventos (HMAC-SHA256) y para
# proteger la ruta de caducidad de pedidos.
N8N_WEBHOOK_SECRET=
```

- [ ] **Step 4: Verificación**

Run: `npx tsc --noEmit` — Expected: sin salida.
Run: `npm test` — Expected: 49 archivos / 686 tests.
Run: `npx eslint lib/webhooks "app/(store)"` — Expected: sin errores.
Run: `npm run build` — Expected: build correcto.

- [ ] **Step 5: Comprobaciones funcionales**

1. **Sin `N8N_WEBHOOK_URL` configurada**: el checkout completa un pedido con normalidad.
2. Con la URL apuntando a un receptor de pruebas (por ejemplo un flujo de n8n con un nodo Webhook): llega el sobre con `evento`, `version`, `emitido_en` y `datos`, y la cabecera `X-Hondusport-Firma`.
3. **Con la URL apuntando a un host inexistente**: el pedido se crea igual y el fallo aparece en el registro. Esta es la comprobación que importa.

- [ ] **Step 6: Commit**

```bash
git add lib/webhooks "app/(store)" .env.example
git commit -m "feat(webhooks): publicar pedido.creado hacia n8n sin bloquear la venta (W1a)"
```

---

## Task 11: Caducidad de pedidos impagos

**Files:**
- Create: `app/api/pedidos/caducar/route.ts`
- Modify: `app/admin/pedidos/PedidosClient.tsx` (señalar los próximos a vencer)

**Interfaces:**
- Consumes: `estaVencido` de `lib/tienda/pagos.ts` (Task 4); `firmaValida` de `lib/webhooks/evento.ts` (Task 9).
- Produces: la ruta `POST /api/pedidos/caducar`, que n8n llama en un horario programado.

**Por qué existe esta tarea:** `crear_pedido` **descuenta stock**. Un pedido que nadie paga no es una fila de más: es mercancía apartada que deja de poder venderse.

**Por qué n8n y no un programador propio:** se está montando de todos modos para el flujo de WhatsApp, así que sirve de reloj sin añadir infraestructura nueva.

- [ ] **Step 1: La ruta**

Crea `app/api/pedidos/caducar/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { firmaValida } from '@/lib/webhooks/evento'
import { estaVencido } from '@/lib/tienda/pagos'

export const dynamic = 'force-dynamic'

/**
 * Cancela los pedidos que caducaron sin pagarse y devuelve su stock.
 *
 * La llama n8n en un horario programado. Se protege con el mismo secreto
 * compartido de los webhooks: sin firma válida no hace nada, porque cancelar
 * pedidos ajenos sería un ataque barato.
 *
 * La cancelación pasa por `cambiar_estado_pedido`, que es quien hace el
 * ajuste atómico de inventario — aquí no se toca stock a mano.
 */
export async function POST(request: Request) {
  const secreto = process.env.N8N_WEBHOOK_SECRET
  if (!secreto) {
    return NextResponse.json({ error: 'No configurado' }, { status: 503 })
  }

  const cuerpo = await request.text()
  const firma = request.headers.get('X-Hondusport-Firma') ?? ''
  if (!firmaValida(cuerpo, secreto, firma)) {
    return NextResponse.json({ error: 'Firma inválida' }, { status: 401 })
  }

  const supabase = await createClient()
  const ahora = new Date()

  // Solo pedidos que siguen esperando pago. Un pedido ya en preparación o
  // entregado no caduca aunque su fecha haya pasado, y uno CON comprobante
  // subido tampoco: el cliente cumplió su parte y le toca a la tienda.
  const { data: candidatos, error } = await supabase
    .from('pedidos')
    .select('id, numero, expira_at, comprobante_url')
    .eq('estado', 'recibido')
    .is('comprobante_url', null)
    .not('expira_at', 'is', null)
    .lte('expira_at', ahora.toISOString())
    .limit(200)

  if (error) return NextResponse.json({ error: 'Error de lectura' }, { status: 500 })

  const vencidos = (candidatos ?? []).filter(p => estaVencido(p.expira_at, ahora))
  const cancelados: number[] = []
  const fallidos: number[] = []

  for (const pedido of vencidos) {
    const { error: errCancelar } = await supabase.rpc('cambiar_estado_pedido', {
      p_pedido_id: pedido.id,
      p_estado: 'cancelado',
    })
    if (errCancelar) {
      console.error(`caducar: no se pudo cancelar el pedido ${pedido.numero}`, errCancelar)
      fallidos.push(pedido.numero)
    } else {
      cancelados.push(pedido.numero)
    }
  }

  return NextResponse.json({ revisados: vencidos.length, cancelados, fallidos })
}
```

- [ ] **Step 2: Señalarlo en el panel**

En `/admin/pedidos`, un pedido en estado `recibido` con `expira_at` en el pasado se marca como **«Vencido»**, y uno al que le quedan menos de 6 horas como **«Por vencer»**. Ambos con la paleta de aviso, para que el operador pueda cancelarlo o atenderlo antes de que el reloj lo haga.

Las fechas mostradas llevan `timeZone: 'America/Tegucigalpa'`.

- [ ] **Step 3: Verificación**

Run: `npx tsc --noEmit` — Expected: sin salida.
Run: `npm test` — Expected: 49 archivos / 686 tests.
Run: `npx eslint app/api app/admin/pedidos` — Expected: sin errores.
Run: `npm run build` — Expected: build correcto.

- [ ] **Step 4: Comprobaciones funcionales**

1. Llamar la ruta **sin firma**: responde 401 y no cancela nada.
2. Llamar con firma válida y un pedido vencido de prueba: se cancela y **el stock del producto vuelve a subir**. Comprueba el stock antes y después.
3. Un pedido vencido **con comprobante subido** no se cancela.
4. Un pedido vencido en estado `preparando` no se cancela.
5. En el panel, un pedido próximo a vencer se distingue a simple vista.

- [ ] **Step 5: Commit**

```bash
git add app/api app/admin/pedidos
git commit -m "feat(pedidos): caducidad de impagos con devolucion de stock, disparada por n8n (W1a)"
```

---

## Autorrevisión

**1. Cobertura del spec (bloques 1-7; el 8 es W1b)**

| Requisito | Tarea |
|---|---|
| `metodos_pago.visible_tienda` | 1 |
| Tabla `cuentas_bancarias` con número como texto | 1 |
| Administración en `/admin/configuracion` | 2 |
| Método de pago como bloque del checkout | 5 |
| Frontera de confianza: releer método y cuenta | 4 (regla), 5 (uso) |
| Columnas nuevas de `pedidos` | 3 |
| `crear_pedido` con los datos nuevos | 3 (migración), 5 (llamada) |
| Datos bancarios **después** de confirmar | 7 |
| Instrucciones numeradas | 7 |
| Copiar solo número de cuenta y monto | 7 |
| Monto repetido en cada tarjeta | 7 |
| Botón de WhatsApp con codificación íntegra | 6 (regla + test), 7 (uso) |
| Subir comprobante a bucket privado | 8 |
| Verlo en `/admin/pedidos` | 8 |
| Sobre versionado y firma HMAC | 9 |
| Aviso que nunca bloquea la venta | 10 |
| Sin `N8N_WEBHOOK_URL` todo funciona | 10 |
| Campo trampa | 5 |
| Límite de frecuencia | 5 |
| Caducidad con devolución de stock | 11 |
| Disparo desde n8n con ruta protegida | 11 |

Sin huecos en el alcance de este plan.

**2. Marcadores de relleno:** ninguno. Los pasos de código llevan el código; los de interfaz llevan la estructura exacta y los textos.

**3. Consistencia de tipos entre tareas**

- `CuentaBancaria` — Task 1 la define; Tasks 2, 5 y 7 la consumen con esos campos.
- `validarMetodoDeclarado(metodoId, metodos)` — Task 4 la define; Task 5 la llama con el catálogo releído, cuyas columnas (`id, tipo, activo, visible_tienda`) coinciden con el parámetro.
- `calcularExpiracion(ahora, horas)` y `estaVencido(expiraAt, ahora)` — Task 4; usadas en 5 y 11.
- `construirSobre` / `firmarCuerpo` / `firmaValida` — Task 9; usadas en 10 y 11.
- `enlaceWhatsApp` / `textoComprobanteWhatsApp` — Task 6; usadas en 7.
- `guardarComprobante` / `urlFirmadaComprobante` — Task 8, autocontenidas.
- Conteos de test: 658 → 671 (T4) → 677 (T6) → 686 (T9). Las tareas sin tests nuevos repiten el conteo vigente.

**Corrección aplicada durante la autorrevisión:** la Task 8 necesita escribir en `pedidos` desde un cliente anónimo, y `pedidos` no tiene política de UPDATE pública — un `update` directo habría fallado en silencio contra RLS. Se añadió la RPC `adjuntar_comprobante` (`SECURITY DEFINER`, escribe solo esa columna y solo si está vacía) a la migración de la Task 3, y el Step 1 de la Task 8 la llama en vez de hacer el `update`.

**Nota para quien ejecute la ola:** las Tasks 1 y 3 escriben migraciones que **el usuario debe aplicar** antes de que las comprobaciones funcionales de las Tasks 2, 5, 7, 8 y 11 signifiquen algo. Ninguna tarea debe intentar aplicarlas por su cuenta. Si al llegar a una comprobación la migración no está aplicada, hay que decirlo en el informe y no darla por hecha.
