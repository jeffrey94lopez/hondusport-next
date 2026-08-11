# Rediseño R2b — Descuentos configurables en POS — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar descuentos configurables al POS: presets definidos en Configuración que aparecen como chips de un clic en el pie del carrito (descuento global) y en el modal "Editar Ítem" (descuento por línea), reusando la matemática de descuentos existente sin tocar la emisión fiscal.

**Architecture:** Tabla nueva `descuentos_preset` (CRUD como `metodos_pago`). Un helper puro `presetToDescuento` en `lib/pos/carrito.ts` convierte un preset (% o monto) a un monto en L. recortado al bruto. Los presets activos se cargan en el POS y se muestran como chips que fijan `l.descuento` / `descuentoGlobal` usando los clamps existentes; el prorrateo, el desglose ISV y `emitir_documento` no cambian.

**Tech Stack:** Next.js 16 (App Router, Server Actions), TypeScript, CSS Modules, Vitest, Supabase (Postgres + RLS).

## Global Constraints

- Idioma español (Honduras); moneda Lempiras `L.`.
- La lógica con peso (`presetToDescuento`) va en `lib/pos/` con test (convención CLAUDE.md).
- Tokens Merlin (`app/merlin.css`); chips redondeados (pill), activo dorado; no hardcodear valores con token.
- **Sin enforcement de permisos** (la tabla queda lista para el futuro, sin columnas de permiso hoy).
- **Sin cambios** a la emisión fiscal, al prorrateo (`prorratearDescuentoGlobal`), al desglose ISV ni a `emitir_documento`. Los chips solo fijan `l.descuento` / `descuentoGlobal`.
- `DescuentoPresetTipo = 'porcentaje' | 'monto'`. Presets `porcentaje` con `valor` en `[0,100]`; `monto` con `valor >= 0`.
- Migración aplicada por el usuario **antes** del push.
- Al terminar cada tarea: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm test` (verdes).

---

## File Structure

- `supabase/migration-r2b-descuentos.sql` (crear) — tabla `descuentos_preset` + RLS + seed + smoke.
- `types/index.ts` (modificar) — `DescuentoPresetTipo`, `DescuentoPreset`.
- `lib/pos/carrito.ts` (modificar) — `presetToDescuento`.
- `lib/pos/tests/carrito.test.ts` (modificar) — tests de `presetToDescuento`.
- `app/admin/configuracion/posActions.ts` (modificar) — `DescuentoPresetForm` + `createDescuentoPreset`/`updateDescuentoPreset`/`toggleDescuentoPresetActivo` + `validarDescuentoPresetForm`.
- `app/admin/configuracion/DescuentosSection.tsx` (crear) — CRUD (espeja `MetodosPagoSection`).
- `app/admin/configuracion/ConfigClient.tsx` (modificar) — pestaña `descuentos` + prop.
- `app/admin/configuracion/page.tsx` (modificar) — cargar `descuentos_preset`.
- `components/admin/icons.tsx` (modificar) — `IconDescuentos`.
- `app/admin/pos/page.tsx` (modificar) — cargar presets activos → `PosClient`.
- `app/admin/pos/PosClient.tsx` (modificar) — aceptar `descuentos`, pasar a `CarritoPanel` y `LineaEditorModal`.
- `app/admin/pos/components/LineaEditorModal.tsx` (modificar) — chips por línea + re-skin Stitch.
- `app/admin/pos/components/CarritoPanel.tsx` (modificar) — chips globales.
- `app/admin/pos/pos.module.css` (modificar) — estilos de chips.

---

## Task 1: Migración `descuentos_preset` (tabla + RLS + seed + smoke)

**Files:**
- Create: `supabase/migration-r2b-descuentos.sql`

**Contexto:** patrón de tabla y RLS espejado de `metodos_pago` (`supabase/schema.sql`: `create table if not exists metodos_pago (...)`, `alter table metodos_pago enable row level security;`, `create policy "admin_all_metodos_pago" on metodos_pago for all using (auth.role() = 'authenticated');`). La corre el usuario en el SQL Editor.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migration-r2b-descuentos.sql`:

```sql
-- R2b: presets de descuento configurables para el POS.
-- Tabla con CRUD como metodos_pago; lista para permisos futuros (se le pueden
-- agregar columnas rol_permitido/tope/requiere_autorizacion después sin migración
-- dolorosa). Sin columnas de permiso ni enforcement hoy.

create table if not exists descuentos_preset (
  id         uuid primary key default gen_random_uuid(),
  etiqueta   text not null,
  tipo       text not null check (tipo in ('porcentaje','monto')),
  valor      numeric not null check (valor >= 0 and (tipo <> 'porcentaje' or valor <= 100)),
  activo     boolean not null default true,
  orden      int not null default 0,
  created_at timestamptz default now()
);

alter table descuentos_preset enable row level security;
create policy "admin_all_descuentos_preset" on descuentos_preset
  for all using (auth.role() = 'authenticated');

-- Seed idempotente de dos presets (5%, 10%) para arrancar con chips.
insert into descuentos_preset (etiqueta, tipo, valor, orden)
select v.etiqueta, v.tipo, v.valor, v.orden
from (values ('5%','porcentaje',5,0), ('10%','porcentaje',10,1)) as v(etiqueta, tipo, valor, orden)
where not exists (select 1 from descuentos_preset);

-- SMOKE (correr aparte tras la migración; debe listar los presets sembrados):
--   select etiqueta, tipo, valor, activo, orden from descuentos_preset order by orden;
```

- [ ] **Step 2: Verificación (no se ejecuta aquí) + commit**

Confirmar que las columnas/RLS coinciden con el patrón de `metodos_pago` en `supabase/schema.sql`. `npx tsc --noEmit` (no debe romper nada; es solo un .sql nuevo).

```bash
git add supabase/migration-r2b-descuentos.sql
git commit -m "chore(pos): migracion tabla descuentos_preset + RLS + seed (R2b)"
```

> **Entrega:** el usuario corre esta migración en el SQL Editor de Supabase antes del push.

---

## Task 2: Tipo `DescuentoPreset` + helper `presetToDescuento`

**Files:**
- Modify: `types/index.ts`
- Modify: `lib/pos/carrito.ts`
- Test: `lib/pos/tests/carrito.test.ts`

**Interfaces:**
- Produces: `DescuentoPresetTipo = 'porcentaje' | 'monto'`; `DescuentoPreset` (interface); `presetToDescuento(preset: { tipo: DescuentoPresetTipo; valor: number }, bruto: number): number`. Las tareas 3–6 los consumen.

- [ ] **Step 1: Agregar los tipos**

En `types/index.ts` agregar:

```ts
export type DescuentoPresetTipo = 'porcentaje' | 'monto'

export interface DescuentoPreset {
  id: string
  etiqueta: string
  tipo: DescuentoPresetTipo
  valor: number
  activo: boolean
  orden: number
  created_at?: string
}
```

- [ ] **Step 2: Escribir el test que falla**

En `lib/pos/tests/carrito.test.ts` agregar (junto a los tests existentes, importando `presetToDescuento` desde `../carrito`):

```ts
import { presetToDescuento } from '../carrito'

describe('presetToDescuento', () => {
  it('porcentaje: aplica el % sobre el bruto', () => {
    expect(presetToDescuento({ tipo: 'porcentaje', valor: 10 }, 200)).toBe(20)
  })
  it('monto: devuelve el monto tal cual si cabe en el bruto', () => {
    expect(presetToDescuento({ tipo: 'monto', valor: 50 }, 200)).toBe(50)
  })
  it('recorta el monto al bruto', () => {
    expect(presetToDescuento({ tipo: 'monto', valor: 500 }, 200)).toBe(200)
  })
  it('recorta el porcentaje al bruto (nunca lo supera)', () => {
    expect(presetToDescuento({ tipo: 'porcentaje', valor: 150 }, 200)).toBe(200)
  })
  it('bruto 0 -> 0', () => {
    expect(presetToDescuento({ tipo: 'porcentaje', valor: 10 }, 0)).toBe(0)
  })
  it('nunca negativo', () => {
    expect(presetToDescuento({ tipo: 'monto', valor: -10 }, 200)).toBe(0)
  })
})
```

- [ ] **Step 3: Correr el test y verificar que falla**

Run: `npx vitest run lib/pos/tests/carrito.test.ts`
Expected: FAIL (`presetToDescuento` no exportado).

- [ ] **Step 4: Implementar el helper**

En `lib/pos/carrito.ts` (junto a `descuentoDesdePorcentaje`/`clampDescuentoLinea`, reusando `round2` que ya usa el archivo) agregar:

```ts
import type { DescuentoPresetTipo } from '@/types'

/**
 * Convierte un preset de descuento (porcentaje o monto) a un monto en L.,
 * recortado a [0, bruto]. Reusado por los chips global y por línea del POS.
 */
export function presetToDescuento(preset: { tipo: DescuentoPresetTipo; valor: number }, bruto: number): number {
  const raw = preset.tipo === 'porcentaje' ? (bruto * preset.valor) / 100 : preset.valor
  return round2(Math.min(Math.max(raw, 0), bruto))
}
```

(Si `carrito.ts` aún no importa de `@/types`, agregar el import; `round2` ya está disponible en el archivo — no lo redefinas.)

- [ ] **Step 5: Correr el test y verificar que pasa; typecheck**

Run: `npx vitest run lib/pos/tests/carrito.test.ts && npx tsc --noEmit`
Expected: PASS, sin errores de tipos.

- [ ] **Step 6: Commit**

```bash
git add types/index.ts lib/pos/carrito.ts lib/pos/tests/carrito.test.ts
git commit -m "feat(pos): tipo DescuentoPreset + helper puro presetToDescuento con test (R2b)"
```

---

## Task 3: Server actions del CRUD de presets (`posActions.ts`)

**Files:**
- Modify: `app/admin/configuracion/posActions.ts`

**Interfaces:**
- Consumes: `DescuentoPreset`/`DescuentoPresetTipo` (Task 2), `ActionResult`, `createClient`, `revalidatePath`, `mensajeError` (ya usados en el archivo).
- Produces: `DescuentoPresetForm`; `createDescuentoPreset(form)`, `updateDescuentoPreset(id, form)`, `toggleDescuentoPresetActivo(id, activo)` — todas `Promise<ActionResult>`. Task 4 las consume.

**Contexto:** espejar exactamente el patrón de `createMetodoPago`/`updateMetodoPago`/`toggleMetodoPagoActivo`/`validarMetodoPagoForm` (mismo archivo), que hacen `supabase.from('metodos_pago')...` + `revalidatePath('/admin/configuracion')` + retornan `{ error }` / `{}`.

- [ ] **Step 1: Agregar el form + la validación**

En `app/admin/configuracion/posActions.ts` agregar:

```ts
import type { DescuentoPresetTipo } from '@/types'

export interface DescuentoPresetForm {
  etiqueta: string
  tipo: DescuentoPresetTipo
  valor: number
  orden: number
  activo: boolean
}

function validarDescuentoPresetForm(form: DescuentoPresetForm): string | null {
  if (!form.etiqueta.trim()) return 'La etiqueta es requerida'
  if (form.tipo !== 'porcentaje' && form.tipo !== 'monto') return 'El tipo de descuento no es válido'
  if (!Number.isFinite(form.valor) || form.valor < 0) return 'El valor debe ser un número mayor o igual a 0'
  if (form.tipo === 'porcentaje' && form.valor > 100) return 'El porcentaje no puede ser mayor a 100'
  if (!Number.isFinite(form.orden) || form.orden < 0) return 'El orden debe ser un número mayor o igual a 0'
  return null
}
```

- [ ] **Step 2: Agregar create/update/toggle**

En el mismo archivo agregar (espejando los de método de pago; `tipo` fijo al crear, igual que método):

```ts
export async function createDescuentoPreset(form: DescuentoPresetForm): Promise<ActionResult> {
  const formError = validarDescuentoPresetForm(form)
  if (formError) return { error: formError }

  const supabase = await createClient()
  const { error } = await supabase.from('descuentos_preset').insert({
    etiqueta: form.etiqueta.trim(),
    tipo: form.tipo,
    valor: form.valor,
    orden: form.orden,
    activo: form.activo,
  })
  if (error) return { error: mensajeError(error) }

  revalidatePath('/admin/configuracion')
  return {}
}

export async function updateDescuentoPreset(id: string, form: DescuentoPresetForm): Promise<ActionResult> {
  const formError = validarDescuentoPresetForm(form)
  if (formError) return { error: formError }

  const supabase = await createClient()
  const { error } = await supabase.from('descuentos_preset').update({
    etiqueta: form.etiqueta.trim(),
    valor: form.valor,
    orden: form.orden,
    activo: form.activo,
  }).eq('id', id)
  if (error) return { error: mensajeError(error) }

  revalidatePath('/admin/configuracion')
  return {}
}

export async function toggleDescuentoPresetActivo(id: string, activo: boolean): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('descuentos_preset').update({ activo }).eq('id', id)
  if (error) return { error: mensajeError(error) }

  revalidatePath('/admin/configuracion')
  return {}
}
```

(Nota: `updateDescuentoPreset` no cambia `tipo` —igual que `updateMetodoPago` no cambia el tipo—; el tipo se fija al crear.)

- [ ] **Step 3: Verificación, commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

```bash
git add app/admin/configuracion/posActions.ts
git commit -m "feat(config): server actions CRUD de descuentos_preset (R2b)"
```

---

## Task 4: Sección "Descuentos" en Configuración (CRUD UI)

**Files:**
- Create: `app/admin/configuracion/DescuentosSection.tsx`
- Modify: `app/admin/configuracion/ConfigClient.tsx`
- Modify: `app/admin/configuracion/page.tsx`
- Modify: `components/admin/icons.tsx`

**Interfaces:**
- Consumes: `DescuentoPreset` (Task 2); `createDescuentoPreset`/`updateDescuentoPreset`/`toggleDescuentoPresetActivo`/`DescuentoPresetForm` (Task 3).

**Contexto:** `DescuentosSection` espeja `app/admin/configuracion/MetodosPagoSection.tsx` (misma estructura: tabla + modal crear/editar + toggle activo, usando `Modal`, `Toggle`, `styles` de `PosSection.module.css`). Diferencias: columnas Etiqueta / Tipo / Valor / Orden / Estado; el form tiene `etiqueta` (text), `tipo` (select porcentaje/monto, fijo al editar como el método), `valor` (number), `orden` (number), `activo` (toggle). El look Stitch ya lo hereda de la Configuración re-skineada en R2a.

- [ ] **Step 1: Crear `DescuentosSection.tsx`**

Crear `app/admin/configuracion/DescuentosSection.tsx` copiando la estructura de `MetodosPagoSection.tsx` y adaptando:
- Props: `{ descuentos: DescuentoPreset[] }`.
- `EMPTY: DescuentoPresetForm = { etiqueta: '', tipo: 'porcentaje', valor: 0, orden: 0, activo: true }`.
- Encabezado: `<IconDescuentos className="iconoMerlin" />Descuentos` + subtítulo "Presets de descuento para el mostrador"; botón "+ Nuevo descuento".
- Tabla: columnas Etiqueta, Tipo (`porcentaje`→"Porcentaje", `monto`→"Monto"), Valor (mostrar `5%` o `L. 50` según tipo con `formatPrice` para monto), Orden, Estado (con `EstadoCell`+`Toggle`), y acción Editar.
- Modal crear/editar (mismo patrón que Métodos): input Etiqueta (required); Tipo como `<select>` al crear y read-only al editar (igual que el método fija su tipo); input Valor (number, `min=0`, y `max=100` cuando `tipo==='porcentaje'`); input Orden; Toggle Activo. Submit llama `createDescuentoPreset`/`updateDescuentoPreset`; toggle llama `toggleDescuentoPresetActivo`.

- [ ] **Step 2: Agregar `IconDescuentos`**

En `components/admin/icons.tsx` agregar un `IconDescuentos` (un icono de etiqueta/porcentaje) siguiendo el patrón de los iconos existentes (mismo tamaño/props que `IconMetodosPago`).

- [ ] **Step 3: Registrar la pestaña en `ConfigClient`**

En `app/admin/configuracion/ConfigClient.tsx`:
- Agregar `descuentos` al arreglo `PESTANAS` (después de `metodos`): `{ id: 'descuentos', label: 'Descuentos', icon: <IconDescuentos ... /> }` (mismo shape que las demás, con su icono).
- Agregar el prop `descuentos: DescuentoPreset[]` a `Props` y al componente.
- Renderizar `<DescuentosSection descuentos={descuentos} />` cuando `pestana === 'descuentos'`.

- [ ] **Step 4: Cargar los presets en `page.tsx`**

En `app/admin/configuracion/page.tsx` agregar a la carga en paralelo:
`supabase.from('descuentos_preset').select('*').order('orden', { ascending: true })`
y pasar `descuentos={descuentos ?? []}` a `<ConfigClient>`.

- [ ] **Step 5: Verificación, build, commit**

Run: `npx tsc --noEmit && npm run lint && npm run build && npm test`
Expected: sin errores; tests verdes.
Visual (dev server, `/admin/configuracion`, login admin — si no puedes autenticarte, verifica por estructura): la pestaña "Descuentos" lista/crea/edita/activa presets; guardar persiste (crear un preset y recargar).

```bash
git add app/admin/configuracion/DescuentosSection.tsx app/admin/configuracion/ConfigClient.tsx app/admin/configuracion/page.tsx components/admin/icons.tsx
git commit -m "feat(config): seccion Descuentos (CRUD de presets) en Configuracion (R2b)"
```

---

## Task 5: Cargar presets en el POS + chips por línea (`LineaEditorModal` re-skin)

**Files:**
- Modify: `app/admin/pos/page.tsx`
- Modify: `app/admin/pos/PosClient.tsx`
- Modify: `app/admin/pos/components/LineaEditorModal.tsx`
- Modify: `app/admin/pos/pos.module.css`

**Interfaces:**
- Consumes: `DescuentoPreset` (Task 2); `presetToDescuento`, `brutoLinea`, `clampDescuentoLinea` (`lib/pos/carrito.ts`).
- Produces: `PosClient` acepta la prop `descuentos: DescuentoPreset[]` y la pasa a `CarritoPanel` (Task 6) y a `LineaEditorModal`.

**Referencia visual:** `docs/diseno/stitch/hondusport_modal_editar_tem_pos/` (fila DESCUENTO con chips `0%` `5%` `10%` `15%` `Otro` + input de monto).

- [ ] **Step 1: Cargar presets activos en `page.tsx`**

En `app/admin/pos/page.tsx` agregar a la carga en paralelo:
`supabase.from('descuentos_preset').select('*').eq('activo', true).order('orden')`
y pasar `descuentos={descuentos ?? []}` a `<PosClient>`.

- [ ] **Step 2: Aceptar y propagar `descuentos` en `PosClient`**

En `app/admin/pos/PosClient.tsx`: agregar `descuentos: DescuentoPreset[]` a las props; pasarla a `<CarritoPanel descuentos={descuentos} ... />` (Task 6 la consume) y a `<LineaEditorModal descuentos={descuentos} ... />` donde se monta el modal.

- [ ] **Step 3: Chips por línea + re-skin en `LineaEditorModal`**

En `app/admin/pos/components/LineaEditorModal.tsx`:
- Agregar `descuentos: DescuentoPreset[]` a `LineaEditorModalProps`.
- Sobre el input de descuento existente, renderizar una fila de **chips**: "Ninguno" (fija `borrador.descuento = 0`), un chip por preset activo (etiqueta del preset), y "Otro" (revela/usa el input de monto manual actual). Al hacer clic en un preset:
  `setBorrador(b => ({ ...b, descuentoModo: 'monto', descuento: presetToDescuento(p, brutoLinea(b)) }))`.
  El chip activo se marca comparando el descuento actual con el que produciría el preset (o un estado local `presetSel`). Mantener el input manual y el `select` L./% existentes bajo "Otro".
- Re-estilizar el modal al look Stitch (chips pill; el activo dorado; inputs redondeados; botón negro "Guardar"), usando tokens Merlin. Conservar toda la lógica actual (cantidad, precio, `onGuardar(clampDescuentoLinea(final))`, ítems libres).

- [ ] **Step 4: Estilos de chips**

En `app/admin/pos/pos.module.css` agregar las clases de chips (pill redondeado `var(--radius-tag)`, activo `var(--brand)`/dorado, inactivo outline), reusables por Task 6.

- [ ] **Step 5: Verificación, build, commit**

Run: `npx tsc --noEmit && npm run lint && npm run build && npm test`
Expected: sin errores; tests verdes.
Visual (login admin, `/admin/pos`): abrir "Editar Ítem" de una línea; los chips aplican el descuento (%, monto) y "Ninguno" lo limpia; "Otro" permite monto manual; el subtotal refleja el descuento; guardar mantiene el valor recortado al bruto.

```bash
git add app/admin/pos/page.tsx app/admin/pos/PosClient.tsx app/admin/pos/components/LineaEditorModal.tsx app/admin/pos/pos.module.css
git commit -m "feat(pos): chips de descuento por linea en el modal Editar Item + re-skin (R2b)"
```

---

## Task 6: Chips de descuento global (`CarritoPanel`)

**Files:**
- Modify: `app/admin/pos/components/CarritoPanel.tsx`

**Interfaces:**
- Consumes: `DescuentoPreset` (Task 2); `presetToDescuento`, `brutoTotalLineas`, `clampDescuentoGlobal` (`lib/pos/carrito.ts`); la prop `descuentos` que `PosClient` ya pasa (Task 5); el handler `onDescuentoGlobal(monto)` existente. Estilos de chips de Task 5 (`pos.module.css`).

- [ ] **Step 1: Chips en el pie del carrito**

En `app/admin/pos/components/CarritoPanel.tsx`:
- Agregar `descuentos: DescuentoPreset[]` a `CarritoPanelProps` y desestructurarla.
- Sobre/junto al input de "Descuento global" existente (`.descuentoGlobalRow`), renderizar la misma fila de chips: "Ninguno" (`onDescuentoGlobal(0)`), un chip por preset activo, y el input manual como "Otro". Al hacer clic en un preset:
  `onDescuentoGlobal(presetToDescuento(p, brutoTotalLineas(lineas)))`.
  (El clamp `clampDescuentoGlobal` ya lo aplica el flujo existente; `presetToDescuento` recorta al bruto total pasado.)
- Reusar las clases de chips de `pos.module.css` (Task 5). No re-maquetar el resto del pie/mostrador (eso es R4).

- [ ] **Step 2: Verificación, build, commit**

Run: `npx tsc --noEmit && npm run lint && npm run build && npm test`
Expected: sin errores; tests verdes.
Visual (login admin, `/admin/pos`): en el pie del carrito, los chips fijan el descuento global (un `%` = ese % del bruto total; un monto lo fija), "Ninguno" lo limpia, el input manual sigue disponible; los totales reflejan el descuento; **emitir una venta de prueba con un chip aplicado** produce un documento con el descuento correcto (prorrateo intacto).

```bash
git add app/admin/pos/components/CarritoPanel.tsx
git commit -m "feat(pos): chips de descuento global en el pie del carrito (R2b)"
```

---

## Self-Review (hecho al escribir el plan)

**1. Spec coverage:**
- Tabla `descuentos_preset` + migración + RLS + seed → Task 1. ✅
- Tipo + `presetToDescuento` con test → Task 2. ✅
- Server actions CRUD → Task 3. ✅
- Sección "Descuentos" en Configuración (CRUD, look Stitch heredado) → Task 4. ✅
- Chips por línea (modal Editar Ítem re-skin) → Task 5. ✅
- Chips globales (pie del carrito) → Task 6. ✅
- Sin permisos hoy (tabla lista) → Task 1 (sin columnas de permiso). ✅
- Sin cambios a emisión/prorrateo/ISV → constraints + Tasks 5/6 solo fijan `l.descuento`/`descuentoGlobal`. ✅
- Frontera con R4 (solo modal + config re-skin) → Tasks 4/5 re-skin; Task 6 estilo consistente sin re-maquetar. ✅

**2. Placeholder scan:** Task 1 (migración) y Task 2 (helper+test) y Task 3 (server actions) traen SQL/código completo. Task 4 espeja `MetodosPagoSection` (código real leído) con adaptaciones concretas. Tasks 5/6 dan directivas concretas de dónde y cómo aplicar `presetToDescuento` + referencia Stitch. Sin "TBD".

**3. Type consistency:** `DescuentoPresetTipo`/`DescuentoPreset` (Task 2) se usan en Tasks 3–6; `presetToDescuento(preset, bruto)` con la misma firma en Task 2 (def) y Tasks 5/6 (uso); `DescuentoPresetForm` (Task 3) usado en Task 4. Nombres de server actions consistentes entre Task 3 y Task 4.

## Notas de entrega (para el controlador SDD)

- **Migración:** Task 1 genera SQL que el usuario corre antes del push (crea la tabla + seed). Las tareas 4–6 leen `descuentos_preset`, así que en dev la tabla debe existir para la verificación visual (o el subagente verifica por estructura si no puede autenticarse).
- **Login admin:** la verificación visual de Config (Task 4) y POS (Tasks 5/6) requiere sesión admin; si el subagente no puede autenticarse, verifica por estructura/estilos computados y deja constancia.
- **Orden sugerido:** 1 → 2 → 3 → 4 → 5 → 6.
- Al mergear: migración aplicada, FF a `main`, verificar deploy READY por SHA; confirmar con el usuario antes de producción.
