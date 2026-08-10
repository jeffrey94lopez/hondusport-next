const round2 = (n: number) => Math.round(n * 100) / 100

export function saldoAplicable(saldoDisponible: number, restante: number): number {
  return Math.max(0, round2(Math.min(saldoDisponible, restante)))
}

export function validarGastoSaldo(saldoDisponible: number, monto: number): string | null {
  if (monto <= 0) return 'El monto debe ser mayor a 0.'
  if (monto > round2(saldoDisponible) + 0.01) return 'El monto excede el saldo a favor disponible.'
  return null
}
