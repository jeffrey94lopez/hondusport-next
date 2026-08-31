import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import ProductCard from '../ProductCard'
import { WishlistContext } from '@/lib/store/wishlist-context'
import { CartContext } from '@/lib/store/cart-context'
import type { CartContextValue } from '@/lib/store/cart-context'
import type { CartItem, StoreProducto } from '@/types/store'

const producto: StoreProducto = {
  id: 'p-1',
  nombre: 'Camiseta',
  slug: 'camiseta',
  descripcion: '',
  precio: 500,
  precioOriginal: null,
  cat: 'Camisetas',
  catId: 'cat-1',
  subcat: null,
  subcatId: null,
  genero: null,
  badge: null,
  tallas: [],
  imagenes: [],
  stock: 10,
  rating: 0,
  ofertaFin: null,
  personalizable: false,
  variantes: [],
}

const wishlist = { ids: [], has: () => false, toggle: () => {} }

function cartValue(cart: CartItem[]): CartContextValue {
  return {
    cart,
    activeDiscount: 0,
    subtotal: 0,
    finalTotal: 0,
    count: 0,
    addToCart: () => {},
    removeFromCart: () => {},
    changeQty: () => {},
    updateCustom: () => {},
    applyCoupon: () => false,
    clear: () => {},
  }
}

function renderCard(
  onQuickAdd: (id: string) => boolean,
  cart: CartItem[] = [],
  prod: StoreProducto = producto,
) {
  return render(
    <CartContext.Provider value={cartValue(cart)}>
      <WishlistContext.Provider value={wishlist}>
        <ProductCard producto={prod} onQuickAdd={onQuickAdd} />
      </WishlistContext.Provider>
    </CartContext.Provider>,
  )
}

const enCarrito = (qty: number, extra: Partial<CartItem> = {}): CartItem => ({
  id: producto.id,
  nombre: producto.nombre,
  precio: producto.precio,
  imagen: '',
  size: 'Única',
  custom: '',
  qty,
  personalizable: false,
  ...extra,
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('ProductCard — confirmación al agregar al carrito', () => {
  it('confirma cuando onQuickAdd informa que sí agregó', () => {
    const { getByLabelText } = renderCard(() => true)
    act(() => {
      getByLabelText('Agregar al carrito').click()
    })
    // El botón pasa a estado "agregado": lo comprobamos por su etiqueta
    // accesible, que es lo que percibe quien no ve la animación.
    expect(getByLabelText('Agregado al carrito')).toBeTruthy()
  })

  it('NO confirma cuando onQuickAdd informa que navegó en vez de agregar', () => {
    // Un producto con variantes manda a la ficha; confirmar ahí seria mentir.
    const { getByLabelText, queryByLabelText } = renderCard(() => false)
    act(() => {
      getByLabelText('Agregar al carrito').click()
    })
    expect(queryByLabelText('Agregado al carrito')).toBeNull()
    expect(getByLabelText('Agregar al carrito')).toBeTruthy()
  })

  it('vuelve al estado normal cuando pasa la confirmación', () => {
    vi.useFakeTimers()
    const { getByLabelText, queryByLabelText } = renderCard(() => true)
    act(() => {
      getByLabelText('Agregar al carrito').click()
    })
    expect(queryByLabelText('Agregado al carrito')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(1200)
    })
    expect(queryByLabelText('Agregado al carrito')).toBeNull()
    expect(getByLabelText('Agregar al carrito')).toBeTruthy()
  })
})

describe('ProductCard — badge de unidades en el carrito', () => {
  it('no muestra badge cuando el producto no está en el carrito', () => {
    const { queryByTestId } = renderCard(() => true, [])
    expect(queryByTestId('card-cart-count')).toBeNull()
  })

  it('muestra las unidades de ESE producto sumando todas sus líneas', () => {
    const { getByTestId } = renderCard(() => true, [
      enCarrito(2, { size: 'M' }),
      enCarrito(3, { size: 'L' }),
      { ...enCarrito(9), id: 'otro-producto' },
    ])
    expect(getByTestId('card-cart-count').textContent).toBe('5')
  })

  it('la etiqueta accesible incluye la cuenta', () => {
    const { getByLabelText } = renderCard(() => true, [enCarrito(2)])
    expect(getByLabelText('Agregar al carrito (2 en el carrito)')).toBeTruthy()
  })
})

describe('ProductCard — un producto agotado no se puede agregar', () => {
  it('producto plano con stock 0: boton deshabilitado y no llama a onQuickAdd', () => {
    let llamadas = 0
    const { getByLabelText, queryByLabelText } = renderCard(
      () => { llamadas++; return true },
      [],
      { ...producto, stock: 0 },
    )
    const btn = getByLabelText('Agotado') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    // El add-to-cart normal ya no debe existir en la tarjeta.
    expect(queryByLabelText('Agregar al carrito')).toBeNull()

    btn.click()
    expect(llamadas).toBe(0)
  })

  it('todas las variantes agotadas: tambien queda agotado', () => {
    let llamadas = 0
    const conVariantesAgotadas: StoreProducto = {
      ...producto,
      stock: null,
      variantes: [
        { id: 'v1', nombre: 'M', precio: null, precioEfectivo: 500, stock: 0, agotada: true },
        { id: 'v2', nombre: 'L', precio: null, precioEfectivo: 500, stock: 0, agotada: true },
      ],
    }
    const { getByLabelText } = renderCard(() => { llamadas++; return true }, [], conVariantesAgotadas)
    const btn = getByLabelText('Agotado') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    btn.click()
    expect(llamadas).toBe(0)
  })

  it('stock null es ilimitado, NO agotado: sigue agregando', () => {
    let llamadas = 0
    const { getByLabelText } = renderCard(
      () => { llamadas++; return true },
      [],
      { ...producto, stock: null },
    )
    getByLabelText('Agregar al carrito').click()
    expect(llamadas).toBe(1)
  })

  it('agotado no muestra el badge de unidades en el carrito', () => {
    // Puede haber unidades de antes si se agoto despues de agregarlas.
    const { queryByTestId } = renderCard(() => true, [enCarrito(2)], { ...producto, stock: 0 })
    expect(queryByTestId('card-cart-count')).toBeNull()
  })
})
