/**
 * sentenceChunker — buffers LLM token stream, flushes on sentence boundaries.
 *
 * This is the key pipelining trick: forward the first complete sentence to TTS
 * immediately instead of waiting for the full completion. Gets first-audio under ~1.5s.
 *
 * Flush boundaries: '. ' | '! ' | '? ' | '\n' | end-of-stream.
 * Minimum chunk: 10 chars (avoids flushing single-word sentences prematurely).
 */

const SENTENCE_END = /[.!?]\s+|[\n]/;
const MIN_CHUNK_LEN = 10;

export async function* sentenceChunker(
  tokens: AsyncIterable<string>,
): AsyncGenerator<string> {
  let buffer = '';

  for await (const token of tokens) {
    buffer += token;

    // Check if we have a sentence boundary past the minimum length
    if (buffer.length >= MIN_CHUNK_LEN) {
      const match = SENTENCE_END.exec(buffer);
      if (match && match.index > 0) {
        const sentence = buffer.slice(0, match.index + match[0].length).trim();
        buffer = buffer.slice(match.index + match[0].length);
        if (sentence) yield sentence;
      }
    }
  }

  // Flush remaining buffer at end of stream
  const remaining = buffer.trim();
  if (remaining) yield remaining;
}
