import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import './NonQrBlockModal.css';

/**
 * CR-2026-05-30-002 — Non-dismissable session-expired modal.
 * Renders via React portal to escape any local stacking context.
 * No backdrop dismissal. No Escape-to-close. Single CTA only.
 *
 * @param {boolean} open
 * @param {() => void} onRescan - CTA handler (caller should navigate to landing)
 */
const NonQrBlockModal = ({ open, onRescan }) => {
  useEffect(() => {
    if (!open) return undefined;
    // Lock background scroll while modal is up.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="nonqr-modal-backdrop"
      data-testid="nonqr-block-modal-backdrop"
      // No onClick — backdrop is intentionally non-dismissable.
      role="presentation"
    >
      <div
        className="nonqr-modal-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="nonqr-modal-title"
        aria-describedby="nonqr-modal-body"
        data-testid="nonqr-block-modal"
      >
        <h2 id="nonqr-modal-title" className="nonqr-modal-title">
          Session Expired
        </h2>
        <p id="nonqr-modal-body" className="nonqr-modal-body">
          Please rescan the QR code at your table to continue. Items in your
          cart will be cleared.
        </p>
        <button
          type="button"
          className="nonqr-modal-cta"
          onClick={onRescan}
          data-testid="nonqr-block-modal-cta"
        >
          OK, Rescan
        </button>
      </div>
    </div>,
    document.body
  );
};

export default NonQrBlockModal;
