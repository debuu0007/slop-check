export function tidyLabels(values: string[]) {
  const clean = values.filter(Boolean);
  const normalized = clean.map((value) => value.trim());
  const unique = [...new Set(normalized)];
  const sorted = unique.sort();
  return sorted;
}
