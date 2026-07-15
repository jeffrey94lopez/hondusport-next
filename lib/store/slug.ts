export function slugify(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function uniqueSlug(base: string, existentes: string[]): string {
  if (!existentes.includes(base)) return base
  let n = 2
  while (existentes.includes(`${base}-${n}`)) n++
  return `${base}-${n}`
}
