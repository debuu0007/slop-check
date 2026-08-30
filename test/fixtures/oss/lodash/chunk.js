export function chunk(array, size) {
  const length = array == null ? 0 : array.length;
  if (!length || size < 1) return [];
  const result = new Array(Math.ceil(length / size));
  for (let index = 0, group = 0; index < length; group += 1) {
    result[group] = array.slice(index, index += size);
  }
  return result;
}
