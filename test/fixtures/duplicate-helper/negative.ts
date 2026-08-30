export function sum(values: number[]) {
  let total = 0;
  for (const value of values) total += value;
  return total;
}
