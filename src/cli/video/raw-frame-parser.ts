/** @internal */
export async function* parseRawFrames(
  chunks: AsyncIterable<Uint8Array>,
  frameBytes: number,
): AsyncGenerator<Uint8Array> {
  if (!Number.isSafeInteger(frameBytes) || frameBytes <= 0) {
    throw new Error("FFmpeg raw video frame size must be a positive integer");
  }

  let frame = new Uint8Array(frameBytes);
  let frameOffset = 0;

  for await (const chunk of chunks) {
    let chunkOffset = 0;
    while (chunkOffset < chunk.length) {
      const copyBytes = Math.min(frameBytes - frameOffset, chunk.length - chunkOffset);
      frame.set(chunk.subarray(chunkOffset, chunkOffset + copyBytes), frameOffset);
      frameOffset += copyBytes;
      chunkOffset += copyBytes;

      if (frameOffset === frameBytes) {
        yield frame;
        frame = new Uint8Array(frameBytes);
        frameOffset = 0;
      }
    }
  }

  if (frameOffset !== 0) {
    throw new Error("FFmpeg raw video stream ended with a truncated frame");
  }
}
