// CR-2026-07-03-004 — fetch wrapper with a hard deadline via AbortController.
// Aborts with a DOMException named 'TimeoutError' when the deadline passes.
// Consumers can distinguish timeouts from other aborts via `error.name === 'TimeoutError'`.

export const DEFAULT_READ_TIMEOUT_MS = 8000;
export const DEFAULT_WRITE_TIMEOUT_MS = 15000;

/**
 * Compose two AbortSignals — either firing aborts the fetch.
 * @param {AbortSignal} a
 * @param {AbortSignal} b
 * @returns {AbortSignal}
 */
function mergeSignals(a, b) {
  const c = new AbortController();
  const forward = (src) => {
    if (src.aborted) {
      c.abort(src.reason);
      return;
    }
    src.addEventListener('abort', () => c.abort(src.reason), { once: true });
  };
  forward(a);
  forward(b);
  return c.signal;
}

/**
 * fetchWithTimeout — same signature as fetch(), plus an optional timeoutMs.
 * @param {RequestInfo | URL} url
 * @param {RequestInit} [opts]
 * @param {number} [timeoutMs=DEFAULT_READ_TIMEOUT_MS]
 * @returns {Promise<Response>}
 */
export function fetchWithTimeout(url, opts = {}, timeoutMs = DEFAULT_READ_TIMEOUT_MS) {
  const controller = new AbortController();
  const signal = opts.signal ? mergeSignals(opts.signal, controller.signal) : controller.signal;
  const timer = setTimeout(
    () => controller.abort(new DOMException(`fetch to ${url} exceeded ${timeoutMs} ms`, 'TimeoutError')),
    timeoutMs
  );
  return fetch(url, { ...opts, signal }).finally(() => clearTimeout(timer));
}

/**
 * Convenience wrapper — write timeout (15 s) instead of the read default.
 */
export function fetchWithWriteTimeout(url, opts = {}) {
  return fetchWithTimeout(url, opts, DEFAULT_WRITE_TIMEOUT_MS);
}

export default fetchWithTimeout;
