/**
 * crmSkipOtpRetry — CR-2026-05-30-001 Item 1
 *
 * Thin retry wrapper around the existing `crmSkipOtp` helper.
 *
 * Why a wrapper (and not modify the helper itself):
 *  - The bare `crmSkipOtp` is still called by `PasswordSetup.handleSkip`
 *    (the manual "Skip for now" button). That call site keeps today's
 *    single-shot behaviour. Risk isolation.
 *  - Only the new Landing-side silent-skip call gets retries.
 *
 * Retry policy (per integration playbook + owner decision D=b):
 *  - Retriable: 429, 500, 502, 503, 504 + transport (no status) errors.
 *  - Non-retriable / bubble to caller: 400, 401, 403, 404, 409, 422.
 *  - 3 attempts max. Exponential backoff with jitter (base 500 ms, cap 4 s).
 *  - Honour `Retry-After` header when present (set on `err.retryAfterMs`
 *    by `crmFetch` — see crmService.js).
 *  - On 409: caller MUST route to /password-setup (Q1=b).
 *  - On exhausted retries / unrecognised errors: caller MUST degrade to
 *    guest mode (D=b).
 */

import { crmSkipOtp } from './crmService';

const RETRIABLE = new Set([429, 500, 502, 503, 504]);
const NON_RETRIABLE_BUBBLE = new Set([400, 401, 403, 404, 409, 422]);

/**
 * @param {string} phone   - raw phone (passed straight to crmSkipOtp)
 * @param {string} userId  - "pos_{posId}_restaurant_{restaurantId}" string
 * @param {object} [opts]
 * @param {number} [opts.maxAttempts=3]
 * @param {number} [opts.baseDelayMs=500]
 * @param {number} [opts.maxDelayMs=4000]
 * @returns {Promise<{token, customer, success, is_new_customer}>}
 */
export const crmSkipOtpWithRetry = async (phone, userId, opts = {}) => {
  const { maxAttempts = 3, baseDelayMs = 500, maxDelayMs = 4000 } = opts;
  let attempt = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await crmSkipOtp(phone, userId);
    } catch (e) {
      const status = e?.status;

      // Non-retriable — bubble immediately so caller's specific handlers fire
      // (e.g. 409 → route to /password-setup; 422 → toast + stay on landing).
      if (NON_RETRIABLE_BUBBLE.has(status)) throw e;

      const isNetworkError = !status;
      const isRetriableStatus = RETRIABLE.has(status);

      if (isRetriableStatus || isNetworkError) {
        if (attempt >= maxAttempts - 1) throw e;

        const expDelay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
        const jitter = Math.random() * expDelay * 0.3;
        const retryAfterMs = typeof e?.retryAfterMs === 'number' ? e.retryAfterMs : 0;
        const delay = Math.max(expDelay + jitter, retryAfterMs);

        await new Promise((resolve) => setTimeout(resolve, delay));
        attempt += 1;
        continue;
      }

      // Unknown error class — bubble as-is (caller treats as exhausted → guest).
      throw e;
    }
  }
};
