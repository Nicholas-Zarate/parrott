/**
 * Minimal push-based async queue: producers push(), one consumer iterates.
 * close() ends iteration once the buffer drains; fail() rejects the consumer.
 */

export interface AsyncQueue<T> extends AsyncIterable<T> {
  push(item: T): void;
  close(): void;
  fail(err: unknown): void;
}

export function createAsyncQueue<T>(): AsyncQueue<T> {
  const buffer: T[] = [];
  let closed = false;
  let error: unknown = null;
  let waiter: ((r: IteratorResult<T>) => void) | null = null;
  let rejecter: ((e: unknown) => void) | null = null;

  const wake = () => {
    if (!waiter) return;
    const resolve = waiter;
    const reject = rejecter;
    waiter = null;
    rejecter = null;
    if (buffer.length > 0) resolve({ value: buffer.shift()!, done: false });
    else if (error) reject?.(error);
    else if (closed) resolve({ value: undefined as T, done: true });
  };

  return {
    push(item) {
      if (closed) return;
      buffer.push(item);
      wake();
    },
    close() {
      closed = true;
      wake();
    },
    fail(err) {
      error = err;
      closed = true;
      wake();
    },
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<T>> {
          if (buffer.length > 0) return Promise.resolve({ value: buffer.shift()!, done: false });
          if (error) return Promise.reject(error);
          if (closed) return Promise.resolve({ value: undefined as T, done: true });
          return new Promise((resolve, reject) => {
            waiter = resolve;
            rejecter = reject;
          });
        },
      };
    },
  };
}
