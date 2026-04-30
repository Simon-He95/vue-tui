export class Buffer extends Uint8Array {
  static alloc(size: number): Buffer {
    return new Buffer(size);
  }

  static from(input: string | ArrayLike<number>): Buffer {
    if (typeof input === "string") {
      return new Buffer(new TextEncoder().encode(input));
    }
    return new Buffer(Array.from(input));
  }

  static concat(chunks: readonly Uint8Array[]): Buffer {
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const out = new Buffer(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }

  toString(): string {
    return new TextDecoder().decode(this);
  }
}
