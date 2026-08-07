import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import MegaSearch from '../MegaSearch'
import type { Categoria } from '@/types/store'

// Dos categorías activas pueden compartir `valor` (la tabla es polimórfica y no
// hay unicidad por nombre). Las keys de React deben salir del id, no del valor.
const categorias: Categoria[] = [
  { id: 'cat-1', tipo: 'cat', valor: 'Camisetas', slug: 'camisetas', imagen: null, categorias_padre: null, orden: 1, activo: true },
  { id: 'cat-2', tipo: 'cat', valor: 'Camisetas', slug: 'camisetas-2', imagen: null, categorias_padre: null, orden: 2, activo: true },
]

afterEach(cleanup)

describe('MegaSearch', () => {
  it('no genera keys duplicadas cuando dos categorías comparten valor', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { rerender } = render(
      <MegaSearch productos={[]} categorias={categorias} isOpen onClose={() => {}} />,
    )
    // El warning de keys duplicadas puede emitirse en el mount o al reconciliar
    // un update, así que forzamos ambos.
    rerender(<MegaSearch productos={[]} categorias={categorias} isOpen onClose={() => {}} />)

    const duplicateKeyWarnings = spy.mock.calls.filter(args =>
      args.some(a => typeof a === 'string' && a.includes('same key')),
    )
    spy.mockRestore()
    expect(duplicateKeyWarnings).toEqual([])
  })

  it('muestra un tag popular por categoría', () => {
    const { getAllByRole } = render(
      <MegaSearch productos={[]} categorias={categorias} isOpen onClose={() => {}} />,
    )
    const tags = getAllByRole('button', { name: 'CAMISETAS' })
    expect(tags).toHaveLength(2)
  })
})
