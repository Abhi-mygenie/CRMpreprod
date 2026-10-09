import React, { useEffect } from 'react';
import { createPortal } from "react-dom";
import './RepeatItemModal.css';

const RepeatItemModal = ({ 
  isOpen, 
  onClose, 
  item,
  onRepeat,
  onCustomize
}) => {
  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle ESC key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen || !item) return null;

  return createPortal(
    <>
      <div className="repeat-modal-overlay" onClick={onClose}></div>
      <div className="repeat-modal" onClick={(e) => e.stopPropagation()}>
        <div className="repeat-modal-content">
          {/* Header */}
          <h2 className="repeat-modal-title">Repeat last item?</h2>

          {/* Body */}
          <p className="repeat-modal-message">
            You already added <strong>{item.name}</strong>. Do you want the same customizations?
          </p>

          {/* Footer Buttons */}
          <div className="repeat-modal-footer">
            <button 
              className="repeat-modal-btn repeat-modal-btn-customize"
              onClick={() => onCustomize(item)}
            >
              CUSTOMIZE
            </button>
            <button 
              className="repeat-modal-btn repeat-modal-btn-repeat"
              onClick={() => onRepeat(item)}
            >
              REPEAT
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
};

export default RepeatItemModal;
