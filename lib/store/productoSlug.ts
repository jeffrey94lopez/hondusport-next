const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// True si el parametro de ruta es un UUID (enlace viejo /producto/<uuid>).
export function esUuid(param: string): boolean {
  return UUID_RE.test(param)
}
