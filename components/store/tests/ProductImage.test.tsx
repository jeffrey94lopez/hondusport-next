import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import ProductImage from '../ProductImage'
import CartDrawer from '../CartDrawer'
import CartProvider from '../CartProvider'
import type { CartItem } from '@/types/store'

const CART_KEY = 'hondusport_cart'

const itemSinFoto: CartItem = {
  id: 'p1',
  nombre: 'FCB LOCAL 23/24 PLAYER',
  precio: 100,
  imagen: '',
  size: 'M',
  custom: 'Sin personalización',
  qty: 1,
  personalizable: false,
}

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('ProductImage', () => {
  it('no renderiza <img> cuando no hay src (next/image reventaba con src="")', () => {
    const { container, getByRole } = render(
      <ProductImage src="" alt="Camisa sin foto" width={80} height={80} />,
    )
    expect(container.querySelector('img')).toBeNull()
    expect(getByRole('img', { name: /sin imagen/i })).toBeTruthy()
  })

  it('tampoco renderiza <img> cuando el src es undefined o null', () => {
    const { container } = render(<ProductImage src={undefined} alt="A" fill sizes="100px" />)
    cleanup()
    const nulo = render(<ProductImage src={null} alt="A" fill sizes="100px" />)
    expect(container.querySelector('img')).toBeNull()
    expect(nulo.container.querySelector('img')).toBeNull()
  })

  it('renderiza el <img> con el src cuando sí hay foto', () => {
    const { container } = render(
      <ProductImage src="https://cdn.test/camisa.jpg" alt="Camisa" width={80} height={80} />,
    )
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBeTruthy()
  })
})

describe('CartDrawer con producto sin foto', () => {
  it('no pinta imágenes con src vacío ni ensucia la consola', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    localStorage.setItem(CART_KEY, JSON.stringify([itemSinFoto]))

    const { container, getByText } = render(
      <CartProvider>
        <CartDrawer isOpen onClose={() => {}} />
      </CartProvider>,
    )

    expect(getByText(itemSinFoto.nombre)).toBeTruthy()
    const vacias = [...container.querySelectorAll('img')].filter(img => !img.getAttribute('src'))
    expect(vacias).toHaveLength(0)
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
