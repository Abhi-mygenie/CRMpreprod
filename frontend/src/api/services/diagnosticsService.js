/**
 * CR-2026-05-30-002 — Client-side diagnostics for non-QR blocks.
 * Fire-and-forget. Never throws. Never blocks the UI flow.
 */

import logger from '../../utils/logger';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

/**
 * Sends a non-QR block event to the backend. Caller does not await this.
 * @param {Object} payload - shape from buildNonQrBlockPayload()
 */
export const postNonQrBlock = (payload) => {
  try {
    // Use sendBeacon when available so a navigation right after this call
    // still delivers the event. Fall back to fetch with keepalive.
    const body = JSON.stringify(payload);
    const url = `${API_URL}/api/diagnostics/non-qr-block`;

    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(url, blob);
      return;
    }

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch((err) => {
      logger.error('diagnostics', 'postNonQrBlock failed:', err);
    });
  } catch (err) {
    logger.error('diagnostics', 'postNonQrBlock threw:', err);
  }
};
