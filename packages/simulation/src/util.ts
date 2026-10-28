export function required<T>(value: T | undefined, description: string): T {
  if (value === undefined) throw new Error(`Missing ${description}`);
  return value;
}
export const ascii = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export const quantize = (value: number) => Math.floor(value + 0.5);
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
