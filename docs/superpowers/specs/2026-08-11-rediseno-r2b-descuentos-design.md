# Rediseño R2b — Descuentos configurables en POS — Diseño

**Fecha:** 2026-08-11
**Serie:** Rediseño Hondusport (adopción de los diseños de Google Stitch). Ola **R2b** (la
serie R2 se partió en **R2a = perfil de empresa unificado** (desplegado) y **R2b =
descuentos configurables en POS**).
**Estado:** aprobado para plan.

## Objetivo

Agregar **descuentos configurables** al mostrador (POS): presets de descuento que el
usuario define en Configuración y que aparecen como **chips** de un clic en dos lugares
del POS —el pie del carrito (descuento global) y el modal "Editar Ítem" (descuento por
línea)—, reusando la matemática de descuentos que ya existe, sin tocar la emisión fiscal.

## Contexto (estado actual)

Los descuentos en POS ya existen como **montos en Lempiras**:
- **Por línea:** `LineaVenta.descuento` (monto). `descuentoModo` (`monto`|`%`) solo controla
  cómo se edita; el valor persistido siempre es monto. `descuentoDesdePorcentaje(linea, pct)`
  convierte % → monto; `clampDescuentoLinea` lo recorta al bruto de la línea. Se edita en
  `LineaEditorModal`.
- **Global:** `descuentoGlobal` (monto) en `PosClient`, recortado con `clampDescuentoGlobal`
  al bruto total; en la emisión se **prorratea** por línea con `prorratearDescuentoGlobal`
  (el documento guarda descuentos por línea, no un campo global). Se edita en el pie de
  `CarritoPanel`.
- **Emisión:** `emitirVenta`/`emitir_documento` NO relee precio/descuento; los clamps
  garantizan que un descuento nunca supere el bruto. POS es contexto de confianza (cajero).
- **Matemática pura** en `lib/pos/carrito.ts` y `lib/pos/desglose.ts` (con tests).

Los descuentos son hoy **montos libres** (input de dinero); no hay presets ni chips.

Referencia visual: `docs/diseno/stitch/hondusport_modal_editar_tem_pos/` — el modal "Editar
Ítem" muestra la fila **DESCUENTO** con chips `0%` `5%` `10%` `15%` `Otro` (pills, activo
dorado) + input de monto para "Otro".

## Alcance

**Dentro:**
- Tabla nueva `descuentos_preset` + sección **"Descuentos"** en Configuración (CRUD),
  con el look Stitch que R2a ya aplicó a Configuración.
- Chips de descuento en el POS: **global** (pie de `CarritoPanel`) y **por línea** (modal
  `LineaEditorModal`, re-estilizado según su Stitch).
- Helper puro `presetToDescuento` en `lib/pos/` con test.

**Fuera:**
- Cualquier **enforcement de permisos** (aún no hay sistema de roles; la tabla solo queda
  *lista* para permisos futuros).
- El re-skin del **resto del mostrador POS** (layout de `CarritoPanel`, catálogo, cobro) —
  eso es R4. Los chips globales se agregan en estilo consistente, sin re-maquetar el mostrador.
- Cambios a la emisión fiscal, al prorrateo, al desglose ISV o a la RPC `emitir_documento`.

## Principios

- **Los chips son azúcar sobre la mecánica existente**: solo fijan `l.descuento` /
  `descuentoGlobal` a partir de un preset. Nada de lógica fiscal nueva.
- **Reusar y no duplicar** la matemática pura (`descuentoDesdePorcentaje`,
  `clampDescuentoLinea`, `clampDescuentoGlobal`, `prorratearDescuentoGlobal`).
- **Merlin/Stitch**: chips redondeados (pill), activo dorado; tokens de `app/merlin.css`.
- Idioma español; Lempiras `L.`.

## 1. Datos y configuración

### 1.1 Tabla `descuentos_preset`
Nueva tabla (se gestiona con CRUD como `cais`/`metodos_pago`/`cajas`, no clave/valor):
- `id` (uuid, PK)
- `etiqueta` (text) — nombre visible del preset (ej. "Empleado", "Promo").
- `tipo` (text, `porcentaje` | `monto`)
- `valor` (numeric) — el % (0–100) o el monto en L. según `tipo`.
- `activo` (boolean, default true)
- `orden` (int) — orden de los chips.
- `created_at` (timestamptz, default now()).

**Lista para permisos futuros:** la tabla es extensible; más adelante se le pueden agregar
columnas (`rol_permitido`, `tope`, `requiere_autorizacion`) sin migración dolorosa. **En
R2b no hay ninguna columna de permiso ni enforcement.**

Migración SQL en `supabase/` (la corre el usuario antes del push): crear la tabla + RLS
consistente con el resto del esquema admin + seed opcional de un par de presets (`5%`,
`10%`).

### 1.2 Sección "Descuentos" en Configuración
Nueva pestaña `descuentos` en el sub-nav de `ConfigClient` (después de "Métodos de pago",
misma mecánica que `MetodosPagoSection`/`CaisSection`):
- Lista de presets con etiqueta, tipo, valor, activo, orden; acciones agregar/editar/
  activar-desactivar (y borrar o desactivar, según patrón existente).
- Server actions en el módulo de acciones de Configuración/POS (patrón de `posActions.ts`):
  `createDescuentoPreset`, `updateDescuentoPreset`, `toggleDescuentoPresetActivo` (nombres
  finales según convención existente).
- Look Stitch (card blanca, inputs redondeados, chips/toggles dorados), consistente con la
  Configuración re-skineada en R2a.

## 2. Aplicación en el POS

Los presets **activos** (ordenados por `orden`) se cargan en el POS y se muestran como chips
en dos lugares. Un helper puro convierte preset → monto de descuento:

```
presetToDescuento(preset: { tipo: 'porcentaje' | 'monto', valor: number }, bruto: number): number
```
- `porcentaje` → `round2(bruto * valor / 100)`, recortado a `[0, bruto]`.
- `monto` → `valor`, recortado a `[0, bruto]`.
Vive en `lib/pos/` con test (casos: %, monto, recorte al bruto, valores límite).

### 2.1 Por línea — modal "Editar Ítem" (`LineaEditorModal`)
Según el Stitch: fila **DESCUENTO** con:
- Chip **"Ninguno"** (0) que limpia el descuento de la línea.
- Un chip por preset activo (etiqueta: `5%`, `10%`, `L. 50`… según tipo/valor).
- Chip **"Otro"** que revela/usa el **input de monto manual** actual.
Al hacer clic en un chip, `l.descuento = presetToDescuento(preset, brutoLinea(l))` (con
`clampDescuentoLinea`). El input manual sigue disponible ("Otro"). Se conserva la lógica
actual del modal (cantidad, precio, guardar con `onGuardar`).
El modal se **re-estiliza** al look Stitch (chips pill dorados, inputs redondeados, botón
negro "Guardar Cambios").

### 2.2 Global — pie del carrito (`CarritoPanel`)
La misma fila de chips para el **descuento global**:
- Chip "Ninguno" (0) que limpia el global.
- Un chip por preset activo (un `%` = ese % del **bruto total** `brutoTotalLineas`; un
  `monto` fija `descuentoGlobal`).
- El input manual de descuento global que ya existe (rol de "Otro").
`descuentoGlobal = presetToDescuento(preset, brutoTotalLineas(lineas))`, con
`clampDescuentoGlobal`. Se agrega en estilo consistente (pill dorado), sin re-maquetar el
resto del pie/mostrador (R4).

### 2.3 Emisión
Sin cambios. Los chips solo fijan `l.descuento`/`descuentoGlobal` en el estado del carrito
(`PosClient`); el prorrateo, el desglose ISV y `emitir_documento` operan igual. Los clamps
existentes garantizan integridad fiscal.

## 3. Alcance visual (frontera con R4)

- **R2b re-estiliza:** el modal "Editar Ítem" (según su Stitch) y la sección "Descuentos"
  de Configuración (look Stitch de R2a).
- **R2b NO re-estiliza:** el resto del mostrador POS (layout de `CarritoPanel`, catálogo,
  modal de cobro) — eso es R4. Los chips globales se agregan en estilo consistente.

## 4. Componentes y archivos (orientativo)

- `supabase/migration-r2b-descuentos.sql` — tabla `descuentos_preset` + RLS + seed + smoke.
- `lib/pos/` — `presetToDescuento` (+ test); tipo `DescuentoPreset`.
- `types/index.ts` — tipo `DescuentoPreset`.
- `app/admin/configuracion/DescuentosSection.tsx` — CRUD de presets (nueva pestaña).
- `app/admin/configuracion/ConfigClient.tsx` — registrar la pestaña `descuentos`.
- `app/admin/configuracion/posActions.ts` (o el módulo de acciones existente) — server
  actions del CRUD de presets.
- `app/admin/pos/**` — cargar presets activos y pasarlos a `PosClient`; chips en
  `CarritoPanel` (global) y `LineaEditorModal` (por línea, re-skin).

## 5. Errores y validación

- `valor` de un preset `porcentaje` se valida a `[0, 100]`; `monto` a `>= 0`. Validación en
  el Server Action (frontera de confianza del CRUD) y en la UI de Configuración.
- Aplicar un preset siempre pasa por `presetToDescuento` + los clamps, así que un preset mal
  configurado (p. ej. monto mayor al bruto) nunca produce un descuento inválido.

## 6. Pruebas y verificación

- **Unitarias:** `presetToDescuento` (%, monto, recorte, límites) en `lib/pos/tests/`; los
  tests existentes de `carrito`/`desglose` siguen verdes.
- `npm test`, `npx tsc --noEmit`, `npm run build`.
- **Visual (dev server, login admin):** la sección "Descuentos" de Configuración (CRUD +
  look Stitch); los chips en el modal "Editar Ítem" (aplican y limpian el descuento de la
  línea) y en el pie del carrito (descuento global); una venta de prueba con un chip aplicado
  emite un documento con el descuento correcto (prorrateo intacto).

## 7. Restricciones globales

- Idioma español; Lempiras `L.`.
- La lógica con peso (preset → descuento) va en `lib/pos/` con test.
- Tokens Merlin; no hardcodear valores que ya tienen token.
- Sin enforcement de permisos (tabla lista para el futuro, sin columnas de permiso hoy).
- Sin cambios a la emisión fiscal, prorrateo, desglose ISV ni `emitir_documento`.
- Migración aplicada por el usuario **antes** del push; confirmar deploy a producción.

## Fuera de alcance

R3 (shell + dashboard), R4 (re-skin del mostrador POS), R5 (resto de módulos admin);
cualquier sistema de roles/permisos; descuentos automáticos por reglas (promociones).
