// @vitest-environment jsdom
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot, type Root } from 'react-dom/client'
import CartProvider from '../CartProvider'
import WishlistProvider from '../WishlistProvider'
import { useCart } from '@/lib/store/cart-context'
import { useWishlist } from '@/lib/store/wishlist-context'
import type { CartItem } from '@/types/store'

// act() fuera de @testing-library requiere marcar el entorno explícitamente
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const CART_KEY = 'hondusport_cart'
const WISHLIST_KEY = 'hs_wishlist'

const item: CartItem = {
  id: 'p1',
  nombre: 'Camisa',
  precio: 100,
  imagen: '',
  size: 'M',
  custom: '',
  qty: 2,
  personalizable: false,
}

function CartBadge() {
  const { count } = useCart()
  return <span>{count}</span>
}

function WishlistBadge() {
  const { ids } = useWishlist()
  return <span>{ids.length}</span>
}

let container: HTMLDivElement
let root: Root | null = null

beforeEach(() => {
  localStorage.clear()
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  container.remove()
  vi.restoreAllMocks()
})

// Hidrata `ui` sobre HTML generado sin datos guardados (como en SSR real,
// donde no hay localStorage) y devuelve los errores de hidratación que
// React reporta al divergir el primer render del cliente.
async function hydrateConDatosGuardados(ui: React.ReactElement, seed: () => void) {
  const html = renderToString(ui)
  seed()
  container.innerHTML = html
  const errores: unknown[] = []
  await act(async () => {
    root = hydrateRoot(container, ui, {
      onRecoverableError(err) {
        errores.push(err)
      },
    })
  })
  return errores
}

describe('CartProvider', () => {
  test('hidrata sin mismatch y muestra el carrito guardado tras montar', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const errores = await hydrateConDatosGuardados(
      <CartProvider>
        <CartBadge />
      </CartProvider>,
      () => localStorage.setItem(CART_KEY, JSON.stringify([item])),
    )
    expect(errores).toEqual([])
    expect(consoleError).not.toHaveBeenCalled()
    // Tras montar, el badge refleja lo guardado (qty 2)
    expect(container.textContent).toBe('2')
  })

  test('no sobreescribe el carrito guardado con el estado vacío inicial', async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
    await hydrateConDatosGuardados(
      <CartProvider>
        <CartBadge />
      </CartProvider>,
      () => localStorage.setItem(CART_KEY, JSON.stringify([item])),
    )
    const escrituras = setItemSpy.mock.calls.filter(([k]) => k === CART_KEY).map(([, v]) => v)
    expect(escrituras).not.toContain('[]')
    expect(JSON.parse(localStorage.getItem(CART_KEY) ?? '[]')).toHaveLength(1)
  })
})

describe('WishlistProvider', () => {
  test('hidrata sin mismatch y muestra la wishlist guardada tras montar', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const errores = await hydrateConDatosGuardados(
      <WishlistProvider>
        <WishlistBadge />
      </WishlistProvider>,
      () => localStorage.setItem(WISHLIST_KEY, JSON.stringify(['a', 'b', 'c'])),
    )
    expect(errores).toEqual([])
    expect(consoleError).not.toHaveBeenCalled()
    expect(container.textContent).toBe('3')
  })

  test('no sobreescribe la wishlist guardada con el estado vacío inicial', async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
    await hydrateConDatosGuardados(
      <WishlistProvider>
        <WishlistBadge />
      </WishlistProvider>,
      () => localStorage.setItem(WISHLIST_KEY, JSON.stringify(['a'])),
    )
    const escrituras = setItemSpy.mock.calls.filter(([k]) => k === WISHLIST_KEY).map(([, v]) => v)
    expect(escrituras).not.toContain('[]')
    expect(JSON.parse(localStorage.getItem(WISHLIST_KEY) ?? '[]')).toHaveLength(1)
  })
})
