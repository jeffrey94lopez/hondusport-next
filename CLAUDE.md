# CLAUDE.md

Guía para trabajar en **Hondusport** (tienda e-commerce Next.js 16 + Supabase).
El README cubre setup, stack y modelo de datos; aquí van las convenciones y
trampas que no son obvias desde el código.

## Comandos

```bash
npm run dev      # desarrollo (localhost:3000)
npm test         # Vitest — corre SIEMPRE tras tocar lib/store
npm run lint     # ESLint
npx tsc --noEmit # typecheck (los Server Actions no están cubiertos por tests)
```

## Arquitectura

- **Route groups:** `app/(store)` es la tienda pública; `app/admin` es el panel.
  `/admin` se protege en `middleware.ts` con Supabase Auth (NO dentro del layout).
- **Dos clientes de Supabase:** `lib/supabase-client.ts` (navegador) y
  `lib/supabase-server.ts` (servidor, con cookies). En Server Components/Actions
  usa siempre el de servidor.
- **`SUPABASE_SERVICE_ROLE_KEY`** solo se usa en `app/api/import`. Nunca la lleves
  a cliente ni a rutas sin auth.

## Convenciones clave

- **La lógica de negocio vive en `lib/store/` como funciones puras** (carrito,
  totales, filtros, búsqueda, tallas…), separada de los componentes. Cada regla
  con peso (dinero, integridad) va aquí y **con test en `lib/store/tests/`**.
  Si una regla está embebida en un componente o Server Action y quieres testearla,
  extráela a `lib/store/` primero (así se hizo con `resolveTrustedCustom` y
  `normalizeStoredCart`).
- **El checkout es una frontera de confianza.** `app/(store)/checkout/actions.ts`
  **relee los productos de la BD** y recalcula precios/totales/personalización —
  nunca confíes en los importes ni en `custom` que manda el cliente. Los totales
  se calculan con `calculateOrderTotals`; el pedido se inserta con la RPC
  `crear_pedido` (atómica).
- **Carrito y wishlist se persisten en `localStorage`** (`CartProvider` /
  `WishlistProvider`). Cuidado con cambios de forma en `CartItem`: los carritos
  guardados antes del cambio no tendrán los campos nuevos. Normalízalos al leer
  (ver `normalizeStoredCart`).
- **`configuracion` es clave/valor.** Se lee con `toConfigMap()` y se inyecta
  desde los layouts. Nuevos ajustes globales van en esa tabla, no hardcodeados.
- **`categorias` es polimórfica** por `tipo` (`cat`/`subcat`/`talla`/`genero`).
  Las tallas de un producto salen de `getTallas()`, no de un campo directo.
- **CSS Modules** por componente (`Componente.module.css`). La tienda scopea sus
  estilos globales bajo `.storeRoot` (ver `store-globals.css`).
- **Idioma:** UI, nombres de dominio y mensajes de commit en español. Moneda en
  Lempiras (`L.`). Precio con `formatPrice()`.

## Al terminar un cambio

1. `npm test` y, si tocaste Server Actions/tipos, `npx tsc --noEmit`.
2. Reporta resultados reales (no afirmes "pasa" sin correrlo).
3. Commits en español, formato convencional (`feat(store): …`, `fix: …`).
