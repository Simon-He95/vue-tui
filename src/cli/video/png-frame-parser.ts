export type PngFrameParserOptions = Readonly<{
  maxFrameBytes: number;
  maxDimension: number;
}>;

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset]! * 0x1000000 +
      (bytes[offset + 1]! << 16) +
      (bytes[offset + 2]! << 8) +
      bytes[offset + 3]!) >>>
    0
  );
}

function hasPngSignature(bytes: Uint8Array, offset: number): boolean {
  for (let index = 0; index < PNG_SIGNATURE.length; index++) {
    if (bytes[offset + index] !== PNG_SIGNATURE[index]) return false;
  }
  return true;
}

function isChunkType(bytes: Uint8Array, offset: number, type: string): boolean {
  return (
    bytes[offset] === type.charCodeAt(0) &&
    bytes[offset + 1] === type.charCodeAt(1) &&
    bytes[offset + 2] === type.charCodeAt(2) &&
    bytes[offset + 3] === type.charCodeAt(3)
  );
}

function validatePngHeader(bytes: Uint8Array, offset: number, maxDimension: number): void {
  if (readUint32(bytes, offset + 8) !== 13 || !isChunkType(bytes, offset + 12, "IHDR")) {
    throw new Error("FFmpeg emitted a PNG without a valid IHDR chunk");
  }

  const width = readUint32(bytes, offset + 16);
  const height = readUint32(bytes, offset + 20);
  if (width <= 0 || height <= 0 || width > maxDimension || height > maxDimension) {
    throw new Error(`FFmpeg emitted an unsupported PNG size: ${width}x${height}`);
  }
}

/** @internal */
export async function* parsePngFrames(
  chunks: AsyncIterable<Uint8Array>,
  options: PngFrameParserOptions,
): AsyncGenerator<Uint8Array> {
  let pending = new Uint8Array(Math.min(64 * 1024, options.maxFrameBytes));
  let length = 0;
  let frameStart = 0;
  let cursor = 0;
  let headerValidated = false;

  for await (const chunk of chunks) {
    if (frameStart > 0) {
      pending.copyWithin(0, frameStart, length);
      length -= frameStart;
      cursor -= frameStart;
      frameStart = 0;
    }

    const required = length + chunk.length;
    if (required > pending.length) {
      let capacity = Math.max(1, pending.length);
      while (capacity < required && capacity < options.maxFrameBytes) {
        capacity = Math.min(options.maxFrameBytes, capacity * 2);
      }
      const grown = new Uint8Array(Math.max(required, capacity));
      grown.set(pending.subarray(0, length));
      pending = grown;
    }
    pending.set(chunk, length);
    length = required;

    while (length - frameStart >= PNG_SIGNATURE.length) {
      if (cursor === frameStart) {
        if (!hasPngSignature(pending, frameStart)) {
          throw new Error("FFmpeg emitted invalid PNG data");
        }
        cursor = frameStart + PNG_SIGNATURE.length;
      }

      if (!headerValidated) {
        if (length - frameStart < 33) break;
        validatePngHeader(pending, frameStart, options.maxDimension);
        headerValidated = true;
      }

      if (length - cursor < 12) break;
      const chunkBytes = readUint32(pending, cursor);
      const chunkEnd = cursor + 12 + chunkBytes;
      if (chunkEnd - frameStart > options.maxFrameBytes) {
        throw new Error(`FFmpeg PNG frame exceeded ${options.maxFrameBytes} bytes`);
      }
      if (chunkEnd > length) break;

      if (isChunkType(pending, cursor + 4, "IEND")) {
        if (chunkBytes !== 0) throw new Error("FFmpeg emitted an invalid PNG IEND chunk");
        yield new Uint8Array(pending.subarray(frameStart, chunkEnd));
        frameStart = chunkEnd;
        cursor = frameStart;
        headerValidated = false;
        if (frameStart === length) {
          length = 0;
          frameStart = 0;
          cursor = 0;
        }
        continue;
      }

      cursor = chunkEnd;
    }

    if (length - frameStart > options.maxFrameBytes) {
      throw new Error(`FFmpeg PNG frame exceeded ${options.maxFrameBytes} bytes`);
    }
  }

  if (length !== frameStart) {
    throw new Error("FFmpeg PNG stream ended with a truncated frame");
  }
}
