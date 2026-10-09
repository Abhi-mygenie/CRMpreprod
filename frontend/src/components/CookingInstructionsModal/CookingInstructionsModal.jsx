import React, { useState, useEffect, useCallback } from 'react';
import { IoCloseOutline } from 'react-icons/io5';
import { createPortal } from "react-dom";
import './CookingInstructionsModal.css';

const CookingInstructionsModal = ({ 
  isOpen, 
  onClose, 
  cartItem,
  onSave
}) => {
  const [instructions, setInstructions] = useState('');
  const [error, setError] = useState('');

  // Initialize instructions when modal opens
  useEffect(() => {
    if (isOpen && cartItem) {
      setInstructions(cartItem.cookingInstructions || '');
      setError('');
    }
  }, [isOpen, cartItem]);

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

  const handleClose = useCallback(() => {
    setInstructions('');
    setError('');
    onClose();
  }, [onClose]);

  // Handle ESC key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, handleClose]);

  if (!isOpen || !cartItem) return null;

  const hasInstructions = cartItem.cookingInstructions && cartItem.cookingInstructions.trim().length > 0;
  const isEditMode = hasInstructions;

  const handleSave = () => {
    const trimmedInstructions = instructions.trim();
    
    // Validate character limit (400 characters)
    if (trimmedInstructions.length > 400) {
      setError('Cooking instructions cannot exceed 400 characters');
      return;
    }

    // Save instructions (can be empty string to clear)
    onSave(cartItem.cartId, trimmedInstructions);
    handleClose();
  };

  const handleClear = () => {
    setInstructions('');
    setError('');
    // Immediately clear instructions
    onSave(cartItem.cartId, '');
    handleClose();
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    // Limit to 400 characters
    if (value.length <= 400) {
      setInstructions(value);
      setError('');
    } else {
      setError('Cooking instructions cannot exceed 400 characters');
    }
  };

  return createPortal(
    <>
      <div className="cooking-instructions-modal-overlay" onClick={handleClose}></div>
      <div className="cooking-instructions-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cooking-instructions-modal-content">
          {/* Header */}
          <div className="cooking-instructions-modal-header">
            <h2 className="cooking-instructions-modal-title">
              {isEditMode ? 'Edit Note' : 'Add Note'}
            </h2>
            <button 
              className="cooking-instructions-modal-close"
              onClick={handleClose}
              aria-label="Close"
            >
              <IoCloseOutline />
            </button>
          </div>

          {/* Body */}
          <div className="cooking-instructions-modal-body">
            <textarea
              className="cooking-instructions-modal-textarea"
              value={instructions}
              onChange={handleInputChange}
              placeholder="Add Note"
              rows={6}
              maxLength={400}
            />
            {error && (
              <div className="cooking-instructions-modal-error">{error}</div>
            )}
            <div className="cooking-instructions-modal-char-count">
              {instructions.length}/400
            </div>
          </div>

          {/* Footer */}
          <div className="cooking-instructions-modal-footer">
            <button 
              className="cooking-instructions-modal-btn cooking-instructions-modal-btn-save"
              onClick={handleSave}
              >
              {isEditMode ? 'Save' : 'Add'}
            </button>
              {isEditMode && (
                <button 
                  className="cooking-instructions-modal-btn cooking-instructions-modal-btn-clear"
                  onClick={handleClear}
                >
                  Clear
                </button>
              )}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
};

export default CookingInstructionsModal;
