interface Pair { left: string; right: string }
export function merge(a: Pair, b: Pair): Pair {
  return { ...a, ...b };
}
