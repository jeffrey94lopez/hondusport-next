# P-diseño — Pulido Merlin — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alinear la UI al design system Merlin actualizado — tokens (colores/radios), fix del hover del chip activo, control de cantidad del POS compacto, e iconos dorados en el dashboard.

**Architecture:** El cambio de look vive en los valores de token de `app/merlin.css` (propaga a toda la app vía `globals.css` y CSS Modules que ya consumen esas variables). Se agrega un modificador `.btnMerlinIconSm` y se corrige el hover del chip activo. El POS aplica el botón compacto y fija el ancho de la caja de cantidad. El único emoji-icono decorativo del admin son los 6 de `KpiSegmento` → SVG dorados (el resto del admin ya usa SVG o símbolos funcionales).

**Tech Stack:** Next.js 16, CSS Modules con tokens Merlin, TypeScript.

## Global Constraints

- Idioma español; tokens Merlin (no hardcodear valores que ya tienen token).
- **Solo pulido de estilo**: sin cambios de datos, lógica ni estructura de layout.
- **Iconos dorados sin fondo** (regla `.iconoMerlin` de P6), solo en el chrome de admin/POS. La **tienda** (`app/(store)`, `components/store/*`) y los **símbolos funcionales** (`←`, `×`, `▾`/`▸`, `★`/`☆`, `✎`, `✓`) quedan **fuera**.
- **Legibilidad obligatoria**: ningún estado (hover, activo, deshabilitado) puede dejar texto ilegible con los colores nuevos; se verifica en el navegador.
- Modo oscuro fuera de alcance (app light-only).
- Al terminar: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm test` (debe seguir verde). Reportar resultados reales.

---

## File Structure

- `app/merlin.css` — valores de token (§1 spec), fix hover chip, `.btnMerlinIconSm` (Task 1). También se commitea `merlin-hondusport.md` (el reference que estos tokens ahora reflejan).
- `app/admin/pos/components/CarritoPanel.tsx` + `CarritoPanel.module.css` — control de cantidad (Task 2).
- `components/admin/icons.tsx` — icono `ventas` nuevo; `app/admin/KpiSegmento.tsx` + `app/admin/page.tsx` + `app/admin/dashboard.module.css` — iconos dorados del dashboard (Task 3).

---

## Task 1: Tokens Merlin + fix hover chip + botón compacto

**Files:**
- Modify: `app/merlin.css`
- Modify (commit): `merlin-hondusport.md` (ya editado en el working tree por el usuario; se incluye en el commit como el reference que los tokens reflejan)

**Interfaces:**
- Produces: `.btnMerlinIconSm` (modificador de tamaño para `.btnMerlinIcon`), usado por Task 2. Valores de token nuevos consumidos por toda la app.

- [ ] **Step 1: Actualizar los valores de token en el `:root` de `app/merlin.css`**

Reemplazar estas líneas (bloque CTA, superficies, forma, gradientes) por los valores del design sync:

```css
  /* CTA (negro) */
  --cta: #000000;
  --cta-hover: #000000;
  --cta-disabled-bg: #666666;
  --cta-disabled-text: #b3b3b3;
```
```css
  --page: #dbdce1;
```
```css
  --line: #e6e6e6;
```
```css
  /* Forma */
  --radius-input: 12px;
  --radius-card: 16px;
  --radius-btn: 32px;
  --radius-tag: 100px;
```
```css
  /* Gradientes */
  --gradient-h: linear-gradient(to right, #c9a84c, #000000);
  --gradient-v: linear-gradient(to bottom, #000000, #c9a84c);
```

(No tocar los tokens de estado error/success/warning/info ni la marca dorada `--brand`.)

- [ ] **Step 2: Corregir el hover del chip activo en `app/merlin.css`**

Localizar la regla existente:
```css
.btnMerlinChip:hover:not(:disabled) { background: var(--hover-input); }
```
y reemplazarla por dos reglas que excluyan el estado activo (para que el chip activo — fondo `--cta`, texto blanco — no se aclare y pierda el texto):
```css
.btnMerlinChip:not([aria-pressed="true"]):hover:not(:disabled) { background: var(--hover-input); }
.btnMerlinChip[aria-pressed="true"]:hover:not(:disabled) { background: var(--cta); }
```

- [ ] **Step 3: Agregar el modificador compacto `.btnMerlinIconSm`**

Después del bloque de `.btnMerlinIcon` (y antes o después de `.btnMerlinIconDanger`), agregar:
```css
/* Modificador compacto de .btnMerlinIcon (−/+ de cantidad en la fila del
   carrito del POS). Se compone: className="btnMerlinIcon btnMerlinIconSm".
   Solo reduce tamaño/fuente; hereda fondo/borde/radio/estados. */
.btnMerlinIconSm { width: 32px; height: 32px; font-size: 0.9rem; }
```

- [ ] **Step 4: Verificación visual (dev server)**

Levantar el dev server. Confirmar con el browser:
- Fondo de página gris (`#dbdce1`) con cards blancas; CTA negro; radios más redondeados; tags/pills totalmente redondeados.
- **Hover de un chip ACTIVO** (p. ej. un método de pago seleccionado en el CobroModal, o un chip de categoría anclado): el texto NO desaparece (el fondo se mantiene oscuro).
- Hover de `.btnMerlinPrimary`/`Secondary`/`Tertiary` y estados `:disabled`: texto legible.
Si algún hover deja texto ilegible, ajustar el estado puntual. Si el dev server no es viable, razonar la correctitud y anotarlo.

- [ ] **Step 5: Typecheck, build, commit**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores (cambio solo CSS; build OK).

```bash
git add app/merlin.css merlin-hondusport.md
git commit -m "feat(diseno): tokens Merlin al design sync (negro puro, fondo gris, radios) + fix hover chip activo + btnMerlinIconSm"
```

---

## Task 2: Control de cantidad del POS

**Files:**
- Modify: `app/admin/pos/components/CarritoPanel.tsx`
- Modify: `app/admin/pos/components/CarritoPanel.module.css`

**Interfaces:**
- Consumes: `.btnMerlinIconSm` (Task 1).

- [ ] **Step 1: Botón +/− compacto en `CarritoPanel.tsx`**

En el bloque `.lineaQty` (los dos botones `−`/`+` de cantidad, hoy `className="btnMerlinIcon"`), agregar el modificador compacto a AMBOS:

```tsx
                    <button type="button" className="btnMerlinIcon btnMerlinIconSm" onClick={() => onCantidad(l.key, -1)} aria-label="Restar cantidad">
                      −
                    </button>
```
```tsx
                    <button type="button" className="btnMerlinIcon btnMerlinIconSm" onClick={() => onCantidad(l.key, 1)} aria-label="Sumar cantidad">
                      +
                    </button>
```
(Solo se agrega `btnMerlinIconSm` a los dos botones de cantidad. NO tocar el botón de quitar línea `btnMerlinIcon btnMerlinIconDanger` ni el de editar `✎`.)

- [ ] **Step 2: Ancho fijo de la caja de cantidad en `CarritoPanel.module.css`**

Localizar la clase `.qtyInput` y darle un ancho estable y centrado, para que no cambie de tamaño según los dígitos. Ajustar (o agregar) estas propiedades en `.qtyInput`:

```css
.qtyInput {
  width: 44px;
  text-align: center;
  -moz-appearance: textfield;
}
.qtyInput::-webkit-outer-spin-button,
.qtyInput::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
```
(Conservar las demás propiedades existentes de `.qtyInput` — solo fijar ancho, centrar y quitar las flechas del input number para un ancho consistente. Si `.qtyInput` ya define borde/padding/fuente, mantenerlos.)

- [ ] **Step 3: Verificación visual**

Dev server: en la fila del carrito del POS, los `−`/`+` se ven compactos (32×32) y la caja de cantidad mantiene el mismo ancho con 1 o 3 dígitos. Si no es viable, razonar.

- [ ] **Step 4: Typecheck, build, commit**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores.

```bash
git add app/admin/pos/components/CarritoPanel.tsx app/admin/pos/components/CarritoPanel.module.css
git commit -m "feat(pos): botones de cantidad compactos (btnMerlinIconSm) y caja de cantidad de ancho fijo"
```

---

## Task 3: Iconos dorados del dashboard (`KpiSegmento`)

**Files:**
- Modify: `components/admin/icons.tsx` (agregar icono `ventas`)
- Modify: `app/admin/KpiSegmento.tsx` (prop `icon` de emoji → `IconoKey`)
- Modify: `app/admin/page.tsx` (pasar claves de icono)
- Modify: `app/admin/dashboard.module.css` (tamaño del icono de segmento)

**Interfaces:**
- Consumes: `ICONOS`/`IconoKey` de `components/admin/icons.tsx` (P6); la clase global `.iconoMerlin` (dorado sin fondo).
- Produces: `KpiSegmento` con `icon: IconoKey`.

**Contexto:** `components/admin/icons.tsx` ya tiene los iconos del menú, incluyendo `documentos, cotizaciones, cxc, cxp, productos`. Falta uno para "Ventas" (💵). Los 6 segmentos mapean: Ventas→`ventas` (nuevo), Documentos→`documentos`, Cotizaciones→`cotizaciones`, Cuentas por cobrar→`cxc`, Cuentas por pagar→`cxp`, Ítems→`productos`.

- [ ] **Step 1: Agregar el icono `ventas` en `components/admin/icons.tsx`**

Seguir el patrón `base(path, className)` existente (SVG viewBox 0 0 24 24, stroke currentColor, fill none). Un icono de billete/dinero:

```tsx
export const IconVentas = ({ className }: { className?: string }) => base(
  <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></>,
  className,
)
```
y registrarlo en el mapa `ICONOS`: `ventas: IconVentas,`.

- [ ] **Step 2: Cambiar `KpiSegmento.tsx` para renderizar el SVG dorado**

Reemplazar el tipo de `icon` y su render:

```tsx
import { ICONOS, type IconoKey } from '@/components/admin/icons'
import styles from './dashboard.module.css'

interface Metrica {
  label: string
  valor: string
  alerta?: boolean
}

interface Props {
  icon: IconoKey
  titulo: string
  metricas: Metrica[]
}

export default function KpiSegmento({ icon, titulo, metricas }: Props) {
  const Icono = ICONOS[icon]
  return (
    <div className={styles.segmento}>
      <div className={styles.segmentoHead}>
        <span className={styles.segmentoIcon}><Icono className="iconoMerlin" /></span>
        {titulo}
      </div>
      <div className={styles.segmentoMetricas}>
        {metricas.map(m => (
          <div key={m.label} className={`${styles.segMetrica} ${m.alerta ? styles.segAlerta : ''}`}>
            <div className={styles.segValor}>{m.valor}</div>
            <div className={styles.segLabel}>{m.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Pasar claves de icono en `app/admin/page.tsx`**

Reemplazar los emojis de los 6 `<KpiSegmento icon="…">`:

```tsx
        <KpiSegmento icon="ventas" titulo="Ventas" metricas={[
```
```tsx
        <KpiSegmento icon="documentos" titulo="Documentos" metricas={[
```
```tsx
        <KpiSegmento icon="cotizaciones" titulo="Cotizaciones" metricas={[
```
```tsx
        <KpiSegmento icon="cxc" titulo="Cuentas por cobrar" metricas={[
```
```tsx
        <KpiSegmento icon="cxp" titulo="Cuentas por pagar" metricas={[
```
```tsx
        <KpiSegmento icon="productos" titulo="Ítems" metricas={[
```

- [ ] **Step 4: Tamaño del icono de segmento en `dashboard.module.css`**

Localizar `.segmentoIcon` (hoy dimensionado para emoji) y ajustarlo para el SVG (el color dorado lo da `.iconoMerlin`):

```css
.segmentoIcon { font-size: 1.15rem; display: inline-flex; align-items: center; }
```
(`.iconoMerlin svg` ya resuelve `width/height: 1em` y `stroke: currentColor` dorado, así que el `font-size` controla el tamaño.)

- [ ] **Step 5: Verificación, typecheck, build, commit**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: sin errores (el cambio de prop `icon: IconoKey` obliga a que page.tsx pase claves válidas — tsc lo valida).

Visual (si es viable): el dashboard muestra los 6 segmentos con iconos dorados sin fondo (no emojis). Si no es viable, razonar.

```bash
git add components/admin/icons.tsx app/admin/KpiSegmento.tsx app/admin/page.tsx app/admin/dashboard.module.css
git commit -m "feat(dashboard): iconos dorados (SVG) en las cards de segmento, reemplazando emojis"
```

---

## Self-Review (hecho al escribir el plan)

**1. Spec coverage:**
- Tokens (colores/radios/gradientes) → Task 1 Step 1. ✅
- Fix hover del chip activo → Task 1 Step 2. ✅
- `.btnMerlinIconSm` + control de cantidad POS (botón compacto + caja ancho fijo) → Task 1 Step 3 + Task 2. ✅
- Iconos dorados en admin (KpiSegmento) + expandir icons.tsx → Task 3. ✅
- Tienda y símbolos funcionales fuera → no se tocan (constraint). ✅
- Verificación de legibilidad/hover → Task 1 Step 4. ✅

**2. Placeholder scan:** sin TBD/TODO. Los valores de token, las reglas de hover, el path del icono y las claves de KpiSegmento son concretos.

**3. Type consistency:** `IconoKey` (icons.tsx) usado en KpiSegmento (Task 3); las 6 claves pasadas en page.tsx (`ventas, documentos, cotizaciones, cxc, cxp, productos`) existen en `ICONOS` (5 preexistentes + `ventas` agregado en Step 1). `.btnMerlinIconSm` definido en Task 1, consumido en Task 2. ✅

## Notas de entrega (para el controlador SDD)

- **Sin migración** (solo CSS/TSX). No hay smoke SQL.
- Verificación visual final imprescindible (es un cambio de look): fondo gris + cards blancas, CTA negro, radios redondeados, hover legible (chip activo incluido), +/− del POS compacto con caja de ancho fijo, e iconos dorados en el dashboard.
- Al mergear: FF a `main`, verificar deploy READY por SHA.
