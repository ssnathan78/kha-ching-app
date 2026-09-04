/** Round `value` to the nearest `step` increment. */
export function round(value: number, step = 0.5): number {
  const inv = 1.0 / step
  return Math.round(value * inv) / inv
}
