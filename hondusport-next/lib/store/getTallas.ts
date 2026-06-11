import type { StoreProducto, Categoria } from '@/types/store'

export function getTallas(producto: StoreProducto, tallaFiltros: Categoria[]): string[] {
  if (producto.tallas.length > 0) return producto.tallas

  return tallaFiltros
    .filter(filtro =>
      (filtro.categorias_padre ?? []).some(
        padre => padre.toLowerCase() === producto.cat.toLowerCase()
      )
    )
    .map(filtro => filtro.valor)
}
