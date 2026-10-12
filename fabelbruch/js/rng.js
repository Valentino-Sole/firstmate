// Seedbarer Zufallsgenerator (mulberry32). Zustand ist serialisierbar,
// damit Fortsetzen mitten im Lauf identisch weiterwürfelt (Speicherregel).
export class RNG {
  constructor(seed) {
    this.state = seed >>> 0;
  }

  next() {
    let t = (this.state += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    this.state = this.state >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(maxExclusive) {
    return Math.floor(this.next() * maxExclusive);
  }

  pick(arr) {
    return arr[this.int(arr.length)];
  }

  // Gewichtete Auswahl: items = [{item, weight}]
  weighted(items) {
    let total = 0;
    for (const it of items) total += it.weight;
    let r = this.next() * total;
    for (const it of items) {
      r -= it.weight;
      if (r <= 0) return it.item;
    }
    return items[items.length - 1].item;
  }

  serialize() {
    return this.state;
  }

  static from(state) {
    const r = new RNG(0);
    r.state = state >>> 0;
    return r;
  }
}

export function newSeed() {
  return (Date.now() ^ (Math.random() * 0xFFFFFFFF)) >>> 0;
}
