export type RandomState = [number, number, number, number];
const mask64 = (1n << 64n) - 1n;
const rotl = (x: number, k: number) => ((x << k) | (x >>> (32 - k))) >>> 0;

// Blackman/Vigna xoshiro128** 1.1 and Vigna SplitMix64 reference algorithms.
// https://prng.di.unimi.it/xoshiro128starstar.c ; https://prng.di.unimi.it/splitmix.c
export function expandSeed(seed: number): RandomState {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new Error('Invalid uint32 seed');
  let x = BigInt(seed);
  function next64() {
    x = (x + 0x9e3779b97f4a7c15n) & mask64;
    let z = x;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & mask64;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & mask64;
    return z ^ (z >> 31n);
  }
  const a = next64();
  const b = next64();
  return [Number(a & 0xffffffffn), Number(a >> 32n), Number(b & 0xffffffffn), Number(b >> 32n)];
}
export class Random {
  private state: RandomState;
  constructor(state: RandomState) {
    if (
      state.every((n) => n === 0) ||
      state.some((n) => !Number.isInteger(n) || n < 0 || n > 0xffffffff)
    )
      throw new Error('Invalid PRNG state');
    this.state = [...state];
  }
  snapshot(): RandomState {
    return [...this.state];
  }
  next(): number {
    let [a, b, c, d] = this.state;
    const result = Math.imul(rotl(Math.imul(b, 5), 7), 9) >>> 0;
    const t = b << 9;
    c ^= a;
    d ^= b;
    b ^= c;
    a ^= d;
    c ^= t;
    d = rotl(d, 11);
    this.state = [a >>> 0, b >>> 0, c >>> 0, d >>> 0];
    return result;
  }
  integer(bound: number): number {
    if (!Number.isInteger(bound) || bound <= 0 || bound > 0x100000000)
      throw new Error('Invalid random bound');
    const limit = Math.floor(0x100000000 / bound) * bound;
    let value: number;
    do {
      value = this.next();
    } while (value >= limit);
    return value % bound;
  }
  jump(): void {
    const result: RandomState = [0, 0, 0, 0];
    for (const polynomial of [0x8764000b, 0xf542d2d3, 0x6fa035c3, 0x77f2db5b]) {
      for (let bit = 0; bit < 32; bit++) {
        if (polynomial & (1 << bit)) {
          result[0] ^= this.state[0];
          result[1] ^= this.state[1];
          result[2] ^= this.state[2];
          result[3] ^= this.state[3];
        }
        this.next();
      }
    }
    this.state = result.map((n) => n >>> 0) as RandomState;
  }
}
export function randomStreams(seed: number) {
  const demand = new Random(expandSeed(seed));
  const visual = new Random(expandSeed(seed));
  visual.jump();
  return { demand, visual };
}
