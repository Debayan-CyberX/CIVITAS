export type Digest = (text: string) => Promise<string>;

// Arrays retain semantic order. Entity tables are sorted explicitly by their producer.
export function canonical(value: unknown): string {
  const active = new Set<object>();
  function encode(item: unknown): string {
    if (item === null) return 'null';
    if (typeof item === 'string' || typeof item === 'boolean') return JSON.stringify(item);
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw new Error('Non-finite canonical number');
      return JSON.stringify(Object.is(item, -0) ? 0 : item);
    }
    if (typeof item !== 'object') throw new Error('Non-JSON canonical value');
    if (active.has(item)) throw new Error('Cyclic canonical value');
    active.add(item);
    let encoded: string;
    if (Array.isArray(item)) {
      const values: string[] = [];
      for (let i = 0; i < item.length; i++) values.push(encode(item[i]));
      encoded = '[' + values.join(',') + ']';
    } else {
      if (
        Object.getPrototypeOf(item) !== Object.prototype &&
        Object.getPrototypeOf(item) !== null
      ) {
        throw new Error('Canonical values must be plain objects');
      }
      const record = item as Record<string, unknown>;
      encoded =
        '{' +
        Object.keys(record)
          .sort()
          .map((key) => JSON.stringify(key) + ':' + encode(record[key]))
          .join(',') +
        '}';
    }
    active.delete(item);
    return encoded;
  }
  return encode(value);
}
