export function ensureArray(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}


