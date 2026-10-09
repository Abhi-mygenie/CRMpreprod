import React, { useState, useEffect, useMemo } from 'react';
import QuantitySelector from '../QuantitySelector/QuantitySelector';
import PriceBreakdown from '../PriceBreakdown/PriceBreakdown';
import { createPortal } from "react-dom";
import './CustomizeItemModal.css';

const CustomizeItemModal = ({
  isOpen,
  onClose,
  item,
  onAddToCart
}) => {
  const [selectedVariations, setSelectedVariations] = useState({});
  const [selectedAddons, setSelectedAddons] = useState({});
  const [itemQuantity, setItemQuantity] = useState(1);

  // Initialize selected variations for required single-type variations
  useEffect(() => {
    if (!item || !isOpen) return;

    const initialVariations = {};
    const initialAddons = {};

    // Initialize required single variations with first option
    if (item.variations && item.variations.length > 0) {
      item.variations.forEach((variation, index) => {
        if (variation.required === 'on' && variation.type === 'single' && variation.values && variation.values.length > 0) {
          initialVariations[index] = [variation.values[0]];
        } else {
          initialVariations[index] = [];
        }
      });
    }

    // Initialize addons with quantity 0
    if (item.add_ons && item.add_ons.length > 0) {
      item.add_ons.forEach((addon) => {
        initialAddons[addon.id] = 0;
      });
    }

    setSelectedVariations(initialVariations);
    setSelectedAddons(initialAddons);
    setItemQuantity(1);
  }, [item, isOpen]);

  // Calculate prices
  const priceCalculation = useMemo(() => {
    if (!item) return { basePrice: 0, variationsTotal: 0, addonsTotal: 0, total: 0 };

    const basePrice = parseFloat(item.price) || 0;

    // Calculate variations total
    let variationsTotal = 0;
    if (item.variations && item.variations.length > 0) {
      item.variations.forEach((variation, index) => {
        const selected = selectedVariations[index] || [];
        selected.forEach((selectedValue) => {
          const optionPrice = parseFloat(selectedValue.optionPrice) || 0;
          variationsTotal += optionPrice;
        });
      });
    }

    // Calculate addons total
    let addonsTotal = 0;
    if (item.add_ons && item.add_ons.length > 0) {
      item.add_ons.forEach((addon) => {
        const quantity = selectedAddons[addon.id] || 0;
        const addonPrice = parseFloat(addon.price) || 0;
        addonsTotal += addonPrice * quantity;
      });
    }

    const subtotal = basePrice + variationsTotal + addonsTotal;
    const total = subtotal * itemQuantity;

    return { basePrice, variationsTotal, addonsTotal, subtotal, total };
  }, [item, selectedVariations, selectedAddons, itemQuantity]);

  // Check if required variations are selected
  const isRequiredVariationsSelected = useMemo(() => {
    if (!item || !item.variations) return true;

    return item.variations.every((variation, index) => {
      if (variation.required !== 'on') return true;
      const selected = selectedVariations[index] || [];
      return selected.length > 0;
    });
  }, [item, selectedVariations]);

  // Handle variation selection
  const handleVariationChange = (variationIndex, value, variationType) => {
    setSelectedVariations((prev) => {
      const newSelections = { ...prev };

      if (variationType === 'single') {
        // Radio button: replace selection
        newSelections[variationIndex] = [value];
      } else {
        // Checkbox: toggle selection
        const current = newSelections[variationIndex] || [];
        const index = current.findIndex(v => v.label === value.label);
        if (index >= 0) {
          newSelections[variationIndex] = current.filter((_, i) => i !== index);
        } else {
          newSelections[variationIndex] = [...current, value];
        }
      }

      return newSelections;
    });
  };

  // Handle addon quantity change
  const handleAddonQuantityChange = (addonId, delta) => {
    setSelectedAddons((prev) => {
      const currentQuantity = prev[addonId] || 0;
      const newQuantity = Math.max(0, currentQuantity + delta);
      return { ...prev, [addonId]: newQuantity };
    });
  };

  // Handle item quantity change
  const handleItemQuantityChange = (delta) => {
    setItemQuantity((prev) => Math.max(1, prev + delta));
  };

  // Handle add to cart
  const handleAddToCartClick = () => {
    if (!isRequiredVariationsSelected) return;

    // Format variations for cart
    const formattedVariations = [];
    if (item.variations && item.variations.length > 0) {
      item.variations.forEach((variation, index) => {
        const selected = selectedVariations[index] || [];
        formattedVariations.push(...selected);
      });
    }

    // Format addons for cart
    const formattedAddons = [];
    if (item.add_ons && item.add_ons.length > 0) {
      item.add_ons.forEach((addon) => {
        const quantity = selectedAddons[addon.id] || 0;
        if (quantity > 0) {
          formattedAddons.push({
            id: addon.id,
            name: addon.name,
            price: addon.price,
            quantity: quantity
          });
        }
      });
    }

    // Add to cart - the addToCart function will handle quantity increment
    // We need to call it itemQuantity times to add the correct quantity
    for (let i = 0; i < itemQuantity; i++) {
      onAddToCart(item, formattedVariations, formattedAddons);
    }

    onClose();
  };

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
      <div className="customize-modal-overlay" onClick={onClose}></div>
      <div className="customize-modal" onClick={(e) => e.stopPropagation()}>
        <div className="customize-modal-content">
          {/* Header — merged: name + price + close */}
          <div className="customize-modal-header">
            <div className="customize-modal-header-info">
              <h2 className="customize-modal-title">{item.name}</h2>
              <span className="customize-modal-item-price">₹{parseFloat(item.price || 0).toFixed(2)}</span>
            </div>
            <button className="customize-modal-close" onClick={onClose} aria-label="Close">
              <span>×</span>
            </button>
          </div>

          <div className="customize-modal-scrollable">
            {/* Variations — no section title, group name is the label */}
            {item.variations && item.variations.length > 0 && (
              <div className="customize-modal-section">
                {item.variations.map((variation, variationIndex) => (
                  <div key={variationIndex} className="customize-variation-group">
                    <div className="customize-variation-header">
                      <span className="customize-variation-name">
                        {variation.name}
                        {variation.required === 'on' && (
                          <span className="customize-variation-required"> (Required)</span>
                        )}
                        {variation.required !== 'on' && (
                          <span className="customize-variation-optional"> (Optional)</span>
                        )}
                      </span>
                    </div>
                    <div className="customize-variation-options">
                      {variation.values && variation.values.map((value, valueIndex) => {
                        const isSelected = (selectedVariations[variationIndex] || []).some(
                          v => v.label === value.label
                        );
                        const optionPrice = parseFloat(value.optionPrice) || 0;

                        return (
                          <label
                            key={valueIndex}
                            className={`customize-variation-option ${isSelected ? 'selected' : ''}`}
                          >
                            <input
                              type={variation.type === 'single' ? 'radio' : 'checkbox'}
                              name={`variation-${variationIndex}`}
                              checked={isSelected}
                              onChange={() => handleVariationChange(variationIndex, value, variation.type)}
                            />
                            <span className="customize-variation-label">{value.label}</span>
                            <span className="customize-variation-price">
                              {optionPrice > 0 ? `+₹${optionPrice.toFixed(2)}` : '+₹0'}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Addons */}
            {item.add_ons && item.add_ons.length > 0 && (
              <div className="customize-modal-section">
                <h3 className="customize-modal-section-title">Addons</h3>
                <div className="customize-addons-list">
                  {item.add_ons.map((addon) => {
                    const quantity = selectedAddons[addon.id] || 0;
                    // CR-2026-09-07-001: addon stock-out disable
                    const isAddonStockOut = addon.stock_out === 'Y';
                    return (
                      <div key={addon.id} className={`customize-addon-item ${quantity > 0 ? 'selected' : ''} ${isAddonStockOut ? 'customize-addon-item--sold-out' : ''}`}>
                        <label className={`customize-addon-checkbox${isAddonStockOut ? ' customize-addon-checkbox--disabled' : ''}`}>
                          <input
                            type="checkbox"
                            checked={quantity > 0}
                            disabled={isAddonStockOut}
                            aria-disabled={isAddonStockOut}
                            onChange={(e) => {
                              if (isAddonStockOut) return;
                              if (e.target.checked) {
                                handleAddonQuantityChange(addon.id, 1);
                              } else {
                                setSelectedAddons((prev) => ({ ...prev, [addon.id]: 0 }));
                              }
                            }}
                          />
                          <span className="customize-addon-name">{addon.name}</span>
                          {isAddonStockOut && (
                            <span className="addon-sold-out-pill" data-testid="customize-addon-sold-out-pill">
                              Sold Out
                            </span>
                          )}
                        </label>
                        <div className="customize-addon-right">
                          <div className="customize-addon-price">₹{parseFloat(addon.price).toFixed(2)}</div>
                          {quantity > 0 && !isAddonStockOut && (
                            <div className="customize-addon-quantity">
                              <QuantitySelector
                                quantity={quantity}
                                onIncrement={() => handleAddonQuantityChange(addon.id, 1)}
                                onDecrement={() => handleAddonQuantityChange(addon.id, -1)}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="customize-modal-footer">
            <div className="customize-modal-footer-quantity">
              <QuantitySelector
                quantity={itemQuantity}
                onIncrement={() => handleItemQuantityChange(1)}
                onDecrement={() => handleItemQuantityChange(-1)}
              />
            </div>
            <button
              className={`customize-modal-add-btn ${!isRequiredVariationsSelected ? 'disabled' : ''}`}
              onClick={handleAddToCartClick}
              disabled={!isRequiredVariationsSelected}
            >
              Add To Cart ₹{priceCalculation.total.toFixed(2)}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
};

export default CustomizeItemModal;
