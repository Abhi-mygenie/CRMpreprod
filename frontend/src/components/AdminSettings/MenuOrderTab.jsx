import React, { useState, useEffect, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  IoEyeOutline,
  IoEyeOffOutline,
  IoRefresh,
  IoChevronDown,
  IoChevronForward,
  IoReorderThree,
  IoSearch,
  IoCheckmarkCircle,
  IoCloseCircle,
  IoTimeOutline,
  IoCloseOutline,
} from 'react-icons/io5';
import { getRestaurantProducts, getRestaurantDetails, getMenuMaster } from '../../api/services/restaurantService';
import { isMultipleMenu } from '../../api/utils/restaurantIdConfig';
import { useAuth } from '../../context/AuthContext';
import './MenuOrderTab.css';
import { isItemAllowedForChannel } from '../../utils/channelEligibility'; // CR-2026-06-17-002 APP-7
import { useToast } from '../../hooks/use-toast'; // CR-2026-06-17-002 APP-10
import logger from '../../utils/logger';

// Sortable Item Component
const SortableItem = ({ id, children }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      {children({ listeners, isDragging })}
    </div>
  );
};

// Drag Handle Component
const DragHandle = ({ listeners }) => (
  <button className="drag-handle" {...listeners} data-testid="drag-handle">
    <IoReorderThree />
  </button>
);

// Toggle Switch Component
const ToggleSwitch = ({ checked, onChange, label }) => (
  <button
    className={`toggle-switch ${checked ? 'active' : ''}`}
    onClick={onChange}
    data-testid={`toggle-${label}`}
  >
    <span className="toggle-track">
      <span className="toggle-thumb" />
    </span>
    <span className="toggle-label">{checked ? 'Visible' : 'Hidden'}</span>
  </button>
);

// Format HH:MM:SS or HH:MM to display-friendly HH:MM
const formatTime = (t) => {
  if (!t) return null;
  return t.split(':').slice(0, 2).join(':');
};

// Timing Display + Inline Editor
const TimingEditor = ({ timing, posStart, posEnd, onChange, onReset, id }) => {
  const [editing, setEditing] = React.useState(false);
  const [start, setStart] = React.useState(timing?.start || '');
  const [end, setEnd] = React.useState(timing?.end || '');

  const isAdminOverride = !!timing;
  const displayStart = timing?.start || formatTime(posStart);
  const displayEnd = timing?.end || formatTime(posEnd);
  const is24hr = !displayStart && !displayEnd;

  React.useEffect(() => {
    setStart(timing?.start || '');
    setEnd(timing?.end || '');
  }, [timing]);

  if (editing) {
    return (
      <div className="timing-editor" data-testid={`timing-editor-${id}`} onClick={(e) => e.stopPropagation()}>
        <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="timing-input" data-testid={`timing-start-${id}`} />
        <span className="timing-sep">-</span>
        <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="timing-input" data-testid={`timing-end-${id}`} />
        <button className="timing-save-btn" onClick={(e) => { e.stopPropagation(); if (start && end) { onChange({ start, end }); setEditing(false); } }} data-testid={`timing-save-${id}`}>
          <IoCheckmarkCircle />
        </button>
        <button className="timing-cancel-btn" onClick={(e) => { e.stopPropagation(); setEditing(false); setStart(timing?.start || ''); setEnd(timing?.end || ''); }} data-testid={`timing-cancel-${id}`}>
          <IoCloseOutline />
        </button>
      </div>
    );
  }

  return (
    <div className={`timing-display ${isAdminOverride ? 'admin-override' : 'pos-default'}`} onClick={(e) => { e.stopPropagation(); setEditing(true); }} data-testid={`timing-display-${id}`}>
      <IoTimeOutline className="timing-icon" />
      <span className="timing-text">{is24hr ? '24 hrs' : `${displayStart} - ${displayEnd}`}</span>
      {isAdminOverride && (
        <button className="timing-reset-btn" onClick={(e) => { e.stopPropagation(); onReset(); }} title="Reset to POS default" data-testid={`timing-reset-${id}`}>
          <IoCloseCircle />
        </button>
      )}
    </div>
  );
};

// CR-2026-06-17-002 APP-9: Status chip redesign (replaces old D/T/Del pills)
const ChannelToggles = ({ channels, onChange, id, posFlags = null }) => {
  const channelSpecs = [
    { key: 'dinein',   label: 'Dine-in'   },
    { key: 'takeaway', label: 'Takeaway'  },
    { key: 'delivery', label: 'Delivery'  },
  ];

  const stateFor = (key) => {
    const adminVal = channels?.[key];
    const posAllowed = posFlags ? posFlags[key] !== 'No' && posFlags[key] !== false : true;
    if (adminVal === undefined || adminVal === null) {
      return { kind: 'pos', allowed: posAllowed };
    }
    return { kind: 'admin', allowed: adminVal === true };
  };

  const handleClick = (key) => {
    const cur = channels?.[key];
    let next;
    if (cur === undefined || cur === null) next = false;
    else if (cur === false) next = true;
    else next = undefined;

    const updated = { ...(channels || {}) };
    if (next === undefined) delete updated[key];
    else updated[key] = next;
    onChange(updated);
  };

  return (
    <div className="channel-chips" onClick={(e) => e.stopPropagation()} data-testid={`channel-toggles-${id}`}>
      {channelSpecs.map(({ key, label }) => {
        const s = stateFor(key);
        const cls = `channel-chip ${s.kind === 'pos' ? (s.allowed ? 'pos-on' : 'pos-off') : (s.allowed ? 'admin-on' : 'admin-off')}`;
        return (
          <button
            key={key}
            type="button"
            className={cls}
            onClick={(e) => { e.stopPropagation(); handleClick(key); }}
            title={
              s.kind === 'pos'
                ? `${s.allowed ? 'Allowed' : 'Blocked'} by POS (no admin override)`
                : `Admin override: ${s.allowed ? 'Allowed' : 'Blocked'}`
            }
            data-testid={`channel-${key}-${id}`}
          >
            <span className="chip-icon" aria-hidden="true">{s.allowed ? '✓' : '✗'}</span>
            <span className="chip-label">{label}</span>
            {s.kind === 'admin' && <span className="chip-dot" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
};

// Category Card Component
const CategoryCard = ({
  cat,
  index,
  items,
  expanded,
  onToggleExpand,
  onToggleVisibility,
  onItemReorder,
  onItemToggle,
  listeners,
  isDragging,
  categoryTiming,
  itemTimings,
  onCategoryTimingChange,
  onCategoryTimingReset,
  onItemTimingChange,
  onItemTimingReset,
  // CR-2026-06-17-001 APP-3: Channel overrides
  categoryChannels,
  itemChannels,
  onCategoryChannelChange,
  onItemChannelChange,
  // CR-2026-06-17-002 APP-7: Preview muting
  previewChannel,
  isCategoryMuted,
  isItemMuted,
  // CR-2026-06-17-002 APP-10: Save discoverability toast
  onInlineEdit,
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleItemDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);
      onItemReorder(arrayMove(items, oldIndex, newIndex));
    }
  };

  const visibleCount = items.filter((i) => i.visible).length;
  const itemPreview = items.slice(0, 3).map((i) => i.name).join(', ');

  return (
    <div
      className={`category-card ${!cat.visible ? 'hidden-category' : ''} ${isDragging ? 'dragging' : ''}`}
      data-testid={`category-${cat.id}`}
    >
      <div
        className={`category-header ${isCategoryMuted ? 'preview-muted' : ''}`}
        onClick={onToggleExpand}
        {...(isCategoryMuted ? { 'data-preview-hidden': 'true' } : {})}
      >
        <DragHandle listeners={listeners} />
        <div className="category-info">
          <div className="category-title-row">
            <span className="category-name">{cat.name}</span>
            <span className="category-badge">{visibleCount}/{items.length} items</span>
            {/* CR-2026-06-17-002 APP-7: Preview hidden badge */}
            {isCategoryMuted && previewChannel && (
              <span className="preview-hidden-badge">Hidden on {previewChannel}</span>
            )}
          </div>
          {!expanded && itemPreview && (
            <span className="category-preview">{itemPreview}...</span>
          )}
        </div>
        <div className="category-actions">
          {/* CR-2026-06-17-002 APP-9: Category-level channel status chips */}
          <ChannelToggles
            channels={categoryChannels}
            onChange={(c) => { onCategoryChannelChange(c); if (onInlineEdit) onInlineEdit(); }}
            id={`cat-${cat.id}`}
            posFlags={null}
          />
          <TimingEditor
            timing={categoryTiming}
            posStart={null}
            posEnd={null}
            onChange={onCategoryTimingChange}
            onReset={onCategoryTimingReset}
            id={`cat-${cat.id}`}
          />
          <ToggleSwitch
            checked={cat.visible}
            onChange={(e) => {
              e.stopPropagation();
              onToggleVisibility();
            }}
            label={cat.name}
          />
          <button className="expand-btn">
            {expanded ? <IoChevronDown /> : <IoChevronForward />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="category-items">
          <div className="items-header">
            <span className="items-title">Items</span>
            <div className="items-bulk-actions">
              <button
                className="bulk-action-btn"
                onClick={() => {
                  const allVisible = items.map((i) => ({ ...i, visible: true }));
                  onItemReorder(allVisible);
                }}
                data-testid="show-all-items"
              >
                <IoCheckmarkCircle /> Show All
              </button>
              <button
                className="bulk-action-btn"
                onClick={() => {
                  const allHidden = items.map((i) => ({ ...i, visible: false }));
                  onItemReorder(allHidden);
                }}
                data-testid="hide-all-items"
              >
                <IoCloseCircle /> Hide All
              </button>
            </div>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleItemDragEnd}
          >
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <div className="items-list">
                {items.map((item, iIdx) => (
                  <SortableItem key={item.id} id={item.id}>
                    {({ listeners: itemListeners, isDragging: itemDragging }) => (
                      <div
                        className={`item-row ${!item.visible ? 'hidden-item' : ''} ${itemDragging ? 'dragging' : ''} ${isItemMuted && isItemMuted(item) ? 'preview-muted' : ''}`}
                        data-testid={`item-${item.id}`}
                        {...(isItemMuted && isItemMuted(item) ? { 'data-preview-hidden': 'true' } : {})}
                      >
                        <DragHandle listeners={itemListeners} />
                        <span className="item-index">{iIdx + 1}</span>
                        <span className="item-name">
                          {item.name}
                          {/* CR-2026-06-17-002 APP-7: Item preview hidden badge */}
                          {isItemMuted && isItemMuted(item) && previewChannel && (
                            <span className="preview-hidden-badge">Hidden on {previewChannel}</span>
                          )}
                        </span>
                        {/* CR-2026-06-17-002 APP-9: Item-level channel status chips with posFlags */}
                        <ChannelToggles
                          channels={itemChannels?.[item.id]}
                          onChange={(c) => { onItemChannelChange(item.id, c); if (onInlineEdit) onInlineEdit(); }}
                          id={`item-${item.id}`}
                          posFlags={{ dinein: item.dinein, takeaway: item.takeaway, delivery: item.delivery }}
                        />
                        <TimingEditor
                          timing={itemTimings?.[item.id]}
                          posStart={item.posTimeStart}
                          posEnd={item.posTimeEnd}
                          onChange={(t) => onItemTimingChange(item.id, t)}
                          onReset={() => onItemTimingReset(item.id)}
                          id={`item-${item.id}`}
                        />
                        <button
                          className={`visibility-btn ${item.visible ? 'visible' : ''}`}
                          onClick={() => onItemToggle(iIdx)}
                          data-testid={`toggle-item-${item.id}`}
                        >
                          {item.visible ? <IoEyeOutline /> : <IoEyeOffOutline />}
                        </button>
                      </div>
                    )}
                  </SortableItem>
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {items.length === 0 && (
            <div className="empty-items">No items in this category</div>
          )}
        </div>
      )}
    </div>
  );
};

// Main Component
const MenuOrderTab = ({ config, setConfig }) => {
  const { user } = useAuth();
  const { toast } = useToast(); // CR-2026-06-17-002 APP-10
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [apiCategories, setApiCategories] = useState([]);
  const [apiItems, setApiItems] = useState({});
  const [restaurant, setRestaurant] = useState(null);
  const [stations, setStations] = useState([]);
  const [stationCategories, setStationCategories] = useState({});
  const [stationItems, setStationItems] = useState({});
  const [selectedStation, setSelectedStation] = useState(null); // NEW: Selected station for pills
  const [expandedCategories, setExpandedCategories] = useState({});
  const [activeId, setActiveId] = useState(null);
  // CR-2026-06-17-002 APP-7: Preview channel state (local only, never saved)
  const [previewChannel, setPreviewChannel] = useState(null);

  // CR-2026-06-17-002 APP-10: Save discoverability toast (fires once per session)
  const SESSION_TOAST_KEY = 'mygenie_save_discoverability_toast_shown';
  const showSaveReminder = useCallback(() => {
    if (sessionStorage.getItem(SESSION_TOAST_KEY) === '1') return;
    toast({
      title: 'Almost saved',
      description: "Click 'Save Changes' at the top to persist.",
      duration: 4000,
    });
    sessionStorage.setItem(SESSION_TOAST_KEY, '1');
  }, [toast]);

  // CR-2026-06-17-002 APP-7: Preview muting helpers
  const isCategoryMutedInPreview = useCallback((cat) => {
    if (!previewChannel) return false;
    const catOverride = config.channelOverrides?.category?.[cat.id];
    return catOverride && catOverride[previewChannel] === false;
  }, [previewChannel, config.channelOverrides]);

  const isItemMutedInPreview = useCallback((cat, item) => {
    if (!previewChannel) return false;
    return !isItemAllowedForChannel(
      { dinein: item.dinein, takeaway: item.takeaway, delivery: item.delivery },
      previewChannel,
      {
        categoryOverride: config.channelOverrides?.category?.[cat.id],
        itemOverride: config.channelOverrides?.item?.[String(item.id)],
      }
    );
  }, [previewChannel, config.channelOverrides]);

  const restaurantId = user?.restaurant_id || user?.id;
  const isMultiMenu = isMultipleMenu(restaurant);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (!restaurantId) return;
    getRestaurantDetails(restaurantId).then(setRestaurant).catch(() => {});
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId) return;
    // Fetch stations from menu-master API
    getMenuMaster(restaurantId).then(data => {
      const menus = data?.menus || [];
      const STANDARD_MENUS = ['Normal', 'Party', 'Premium'];
      const stationMenus = menus.filter(m => !STANDARD_MENUS.includes(m.menu_name));
      setStations(stationMenus.map(menu => ({
        id: menu.menu_name,
        name: menu.menu_name,
        menuId: menu.id,
        image: null,
        timing: null,
      })));
    }).catch(() => setStations([]));
  }, [restaurantId]);

  // Fetch categories + items (non-multiple-menu)
  const fetchCategories = useCallback(async () => {
    if (!restaurantId || isMultiMenu) return;
    setLoading(true);
    try {
      const data = await getRestaurantProducts(restaurantId, '0');
      const products = data?.products || [];
      const cats = [];
      const items = {};
      for (const p of products) {
        const catId = String(p.category_id);
        cats.push({ id: catId, name: p.category_name || '' });
        items[catId] = (p.items || []).map((i) => ({
          id: String(i.id),
          name: i.name || '',
          posTimeStart: i.web_available_time_starts || null,
          posTimeEnd: i.web_available_time_ends || null,
          foodOrder: Number(i.food_order || 0), // CR-2026-06-17-001 APP-1: carry food_order for default sort
          // CR-2026-06-17-002 APP-9: carry POS channel flags for posFlags prop
          dinein: i.dinein || 'Yes',
          takeaway: i.takeaway || 'Yes',
          delivery: i.delivery || 'Yes',
        }));
      }
      // CR-2026-06-17-001 APP-1: Sort items by food_order ascending (0s to end) as POS baseline
      for (const catId of Object.keys(items)) {
        const hasFoodOrder = items[catId].some(i => i.foodOrder > 0);
        if (hasFoodOrder) {
          items[catId].sort((a, b) => {
            if (a.foodOrder === 0 && b.foodOrder === 0) return 0;
            if (a.foodOrder === 0) return 1;
            if (b.foodOrder === 0) return -1;
            return a.foodOrder - b.foodOrder;
          });
        }
      }
      setApiCategories(cats);
      setApiItems(items);
    } catch (err) {
      logger.error('admin', 'Failed to fetch categories:', err);
    } finally {
      setLoading(false);
    }
  }, [restaurantId, isMultiMenu]);

  // Fetch station categories + items (multiple-menu)
  const fetchStationCategories = useCallback(async () => {
    if (!restaurantId || !isMultiMenu || stations.length === 0) return;
    setLoading(true);
    try {
      const catResults = {};
      const itemResults = {};
      for (const station of stations) {
        const data = await getRestaurantProducts(restaurantId, '0', station.id);
        const products = data?.products || [];
        catResults[station.id] = products.map((p) => ({
          id: String(p.category_id),
          name: p.category_name || '',
        }));
        for (const p of products) {
          const key = `${station.id}__${p.category_id}`;
        itemResults[key] = (p.items || []).map((i) => ({
            id: String(i.id),
            name: i.name || '',
            posTimeStart: i.web_available_time_starts || null,
            posTimeEnd: i.web_available_time_ends || null,
            foodOrder: Number(i.food_order || 0), // CR-2026-06-17-001 APP-1: carry food_order
            // CR-2026-06-17-002 APP-9: carry POS channel flags
            dinein: i.dinein || 'Yes',
            takeaway: i.takeaway || 'Yes',
            delivery: i.delivery || 'Yes',
          }));
        }
      }
      setStationCategories(catResults);
      setStationItems(itemResults);
      // CR-2026-06-17-001 APP-1: Sort station items by food_order ascending (0s to end)
      for (const key of Object.keys(itemResults)) {
        const hasFoodOrder = itemResults[key].some(i => i.foodOrder > 0);
        if (hasFoodOrder) {
          itemResults[key].sort((a, b) => {
            if (a.foodOrder === 0 && b.foodOrder === 0) return 0;
            if (a.foodOrder === 0) return 1;
            if (b.foodOrder === 0) return -1;
            return a.foodOrder - b.foodOrder;
          });
        }
      }
    } catch (err) {
      logger.error('admin', 'Failed to fetch station categories:', err);
    } finally {
      setLoading(false);
    }
  }, [restaurantId, isMultiMenu, stations]);

  useEffect(() => {
    if (isMultiMenu && stations.length > 0) fetchStationCategories();
    else if (!isMultiMenu && restaurantId) fetchCategories();
  }, [isMultiMenu, stations, restaurantId, fetchCategories, fetchStationCategories]);

  // --- Merge helpers ---
  const mergeWithSaved = (apiList, savedOrder, savedVisibility) => {
    const ordered = [];
    const seen = new Set();
    for (const s of savedOrder) {
      const item = apiList.find((a) => a.id === s.id);
      if (item) {
        ordered.push({ ...item, visible: savedVisibility[item.id] !== false });
        seen.add(item.id);
      }
    }
    for (const item of apiList) {
      if (!seen.has(item.id)) ordered.push({ ...item, visible: true });
    }
    return ordered;
  };

  // ============ NON-MULTIPLE MENU ============
  const getMergedCategories = () =>
    mergeWithSaved(
      apiCategories,
      config.menuOrder?.categoryOrder || [],
      config.menuOrder?.categoryVisibility || {}
    );

  const getMergedItems = (categoryId) =>
    mergeWithSaved(
      apiItems[categoryId] || [],
      config.menuOrder?.itemOrder?.[categoryId] || [],
      config.menuOrder?.itemVisibility?.[categoryId] || {}
    );

  const updateCategoryConfig = (newCategories) => {
    const categoryOrder = newCategories.map((c) => ({ id: c.id, name: c.name }));
    const categoryVisibility = {};
    newCategories.forEach((c) => {
      categoryVisibility[c.id] = c.visible;
    });
    setConfig((prev) => ({
      ...prev,
      menuOrder: { ...prev.menuOrder, categoryOrder, categoryVisibility },
    }));
  };

  const updateItemConfig = (categoryId, newItems) => {
    const itemOrder = newItems.map((i) => ({ id: i.id, name: i.name }));
    const itemVis = {};
    newItems.forEach((i) => {
      itemVis[i.id] = i.visible;
    });
    setConfig((prev) => ({
      ...prev,
      menuOrder: {
        ...prev.menuOrder,
        itemOrder: { ...prev.menuOrder?.itemOrder, [categoryId]: itemOrder },
        itemVisibility: { ...prev.menuOrder?.itemVisibility, [categoryId]: itemVis },
      },
    }));
  };

  // ============ MULTIPLE MENU ============
  const getMergedStations = () =>
    mergeWithSaved(
      stations,
      config.menuOrder?.stationOrder || [],
      config.menuOrder?.stationVisibility || {}
    );

  const getMergedStationCats = (stationId) =>
    mergeWithSaved(
      stationCategories[stationId] || [],
      config.menuOrder?.stationCategoryOrder?.[stationId] || [],
      config.menuOrder?.stationCategoryVisibility?.[stationId] || {}
    );

  const getMergedStationItems = (stationId, categoryId) => {
    const key = `${stationId}__${categoryId}`;
    return mergeWithSaved(
      stationItems[key] || [],
      config.menuOrder?.stationItemOrder?.[key] || [],
      config.menuOrder?.stationItemVisibility?.[key] || {}
    );
  };

  const updateStationConfig = (newStations) => {
    const stationOrder = newStations.map((s) => ({ id: s.id, name: s.name }));
    const stationVisibility = {};
    newStations.forEach((s) => {
      stationVisibility[s.id] = s.visible;
    });
    setConfig((prev) => ({
      ...prev,
      menuOrder: { ...prev.menuOrder, stationOrder, stationVisibility },
    }));
  };

  const updateStationCatConfig = (stationId, newCats) => {
    const catOrder = newCats.map((c) => ({ id: c.id, name: c.name }));
    const catVis = {};
    newCats.forEach((c) => {
      catVis[c.id] = c.visible;
    });
    setConfig((prev) => ({
      ...prev,
      menuOrder: {
        ...prev.menuOrder,
        stationCategoryOrder: {
          ...prev.menuOrder?.stationCategoryOrder,
          [stationId]: catOrder,
        },
        stationCategoryVisibility: {
          ...prev.menuOrder?.stationCategoryVisibility,
          [stationId]: catVis,
        },
      },
    }));
  };

  const updateStationItemConfig = (stationId, categoryId, newItems) => {
    const key = `${stationId}__${categoryId}`;
    const itemOrder = newItems.map((i) => ({ id: i.id, name: i.name }));
    const itemVis = {};
    newItems.forEach((i) => {
      itemVis[i.id] = i.visible;
    });
    setConfig((prev) => ({
      ...prev,
      menuOrder: {
        ...prev.menuOrder,
        stationItemOrder: { ...prev.menuOrder?.stationItemOrder, [key]: itemOrder },
        stationItemVisibility: { ...prev.menuOrder?.stationItemVisibility, [key]: itemVis },
      },
    }));
  };

  // ============ TIMING HELPERS ============
  const updateCategoryTiming = (catId, timing) => {
    setConfig((prev) => ({
      ...prev,
      categoryTimings: { ...prev.categoryTimings, [catId]: timing },
    }));
  };

  const resetCategoryTiming = (catId) => {
    setConfig((prev) => {
      const updated = { ...prev.categoryTimings };
      delete updated[catId];
      return { ...prev, categoryTimings: updated };
    });
  };

  const updateItemTiming = (itemId, timing) => {
    setConfig((prev) => ({
      ...prev,
      itemTimings: { ...prev.itemTimings, [itemId]: timing },
    }));
  };

  const resetItemTiming = (itemId) => {
    setConfig((prev) => {
      const updated = { ...prev.itemTimings };
      delete updated[itemId];
      return { ...prev, itemTimings: updated };
    });
  };

  // CR-2026-06-17-001 APP-3: Category/Item channel-override writers (item > category > POS cascade)
  const updateCategoryChannel = (catId, channels) => {
    setConfig((prev) => {
      const prevCat = prev.channelOverrides?.category || {};
      const nextCat = { ...prevCat };
      if (!channels || Object.keys(channels).length === 0) {
        delete nextCat[catId];
      } else {
        nextCat[catId] = channels;
      }
      return {
        ...prev,
        channelOverrides: {
          ...(prev.channelOverrides || {}),
          category: nextCat,
        },
      };
    });
  };

  const updateItemChannel = (itemId, channels) => {
    setConfig((prev) => {
      const prevItem = prev.channelOverrides?.item || {};
      const nextItem = { ...prevItem };
      if (!channels || Object.keys(channels).length === 0) {
        delete nextItem[itemId];
      } else {
        nextItem[itemId] = channels;
      }
      return {
        ...prev,
        channelOverrides: {
          ...(prev.channelOverrides || {}),
          item: nextItem,
        },
      };
    });
  };

  // Drag handlers
  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) return;

    const categories = getMergedCategories();
    const oldIndex = categories.findIndex((c) => c.id === active.id);
    const newIndex = categories.findIndex((c) => c.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      updateCategoryConfig(arrayMove(categories, oldIndex, newIndex));
    }
  };

  const handleStationDragEnd = (event) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) return;

    const mergedStations = getMergedStations();
    const oldIndex = mergedStations.findIndex((s) => s.id === active.id);
    const newIndex = mergedStations.findIndex((s) => s.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      updateStationConfig(arrayMove(mergedStations, oldIndex, newIndex));
    }
  };

  if (loading) {
    return (
      <div className="menu-order-loading">
        <div className="loading-spinner" />
        <span>Loading menu data...</span>
      </div>
    );
  }

  // Filter categories by search
  const filterBySearch = (items) => {
    if (!searchTerm.trim()) return items;
    const term = searchTerm.toLowerCase();
    return items.filter((item) => item.name.toLowerCase().includes(term));
  };

  // ============ RENDER: MULTIPLE MENU (Station Pills + Categories) ============
  if (isMultiMenu) {
    const mergedStations = getMergedStations();
    const selectedStationData = mergedStations.find(s => s.id === selectedStation);
    const stationCats = selectedStation ? filterBySearch(getMergedStationCats(selectedStation)) : [];

    // Auto-select first station if none selected
    if (!selectedStation && mergedStations.length > 0 && !loading) {
      setSelectedStation(mergedStations[0].id);
    }

    return (
      <div className="menu-order-tab modern" data-testid="menu-order-tab">
        {/* CR-2026-06-17-001 APP-2: Station Pills with drag-drop reorder */}
        <div className="station-pills-container">
          <div className="station-pills-label">Select Menu:</div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleStationDragEnd}
          >
            <SortableContext
              items={mergedStations.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="station-pills" data-testid="station-pills">
                {mergedStations.map((station) => (
                  <SortableItem key={station.id} id={station.id}>
                    {({ listeners: stationListeners, isDragging: stationDragging }) => (
                      <div
                        className={`station-pill ${selectedStation === station.id ? 'active' : ''} ${!station.visible ? 'hidden-pill' : ''} ${stationDragging ? 'dragging' : ''}`}
                        data-testid={`station-pill-${station.id}`}
                      >
                        <button className="station-drag-handle" {...stationListeners} data-testid={`station-drag-${station.id}`}>
                          <IoReorderThree />
                        </button>
                        <button
                          className="station-pill-btn"
                          onClick={() => {
                            setSelectedStation(station.id);
                            setSearchTerm('');
                          }}
                        >
                          <span className="pill-name">{station.name}</span>
                          {station.timing && <span className="pill-timing">{station.timing}</span>}
                          {!station.visible && <span className="pill-hidden-badge">Hidden</span>}
                        </button>
                      </div>
                    )}
                  </SortableItem>
                ))}
              </div>
            </SortableContext>
            <DragOverlay>
              {activeId && mergedStations.find((s) => s.id === activeId) && (
                <div className="drag-overlay-item station-drag-overlay">
                  {mergedStations.find((s) => s.id === activeId)?.name || 'Menu'}
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>

        {/* Selected Station Header */}
        {selectedStation && selectedStationData && (
          <div className="selected-station-header">
            <div className="station-info">
              <span className="station-title">📍 {selectedStationData.name}</span>
              <span className="station-count">{stationCats.length} categories</span>
            </div>
            <div className="station-controls">
              {/* CR-2026-06-17-001 APP-4: Station timing from POS + admin override */}
              <TimingEditor
                timing={config.stationTimings?.[selectedStation]}
                posStart={selectedStationData.openingTime || null}
                posEnd={selectedStationData.closingTime || null}
                onChange={(t) => {
                  setConfig((prev) => ({
                    ...prev,
                    stationTimings: { ...prev.stationTimings, [selectedStation]: t },
                  }));
                }}
                onReset={() => {
                  setConfig((prev) => {
                    const updated = { ...prev.stationTimings };
                    delete updated[selectedStation];
                    return { ...prev, stationTimings: updated };
                  });
                }}
                id={`station-${selectedStation}`}
              />
              <ToggleSwitch
                checked={selectedStationData.visible}
                onChange={() => {
                  const updated = getMergedStations().map((s) =>
                    s.id === selectedStation ? { ...s, visible: !s.visible } : s
                  );
                  updateStationConfig(updated);
                }}
                label={selectedStationData.name}
              />
              <button
                className="refresh-btn"
                onClick={fetchStationCategories}
                data-testid="menu-order-refresh"
              >
                <IoRefresh /> Refresh
              </button>
            </div>
          </div>
        )}

        {/* Search & Info */}
        {selectedStation && (
          <>
            <div className="menu-order-toolbar">
              <div className="search-box">
                <IoSearch className="search-icon" />
                <input
                  type="text"
                  placeholder="Search categories..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  data-testid="menu-search"
                />
              </div>
              {/* CR-2026-06-17-002 APP-7: Preview channel selector */}
              <label className="preview-channel-label">
                Preview as:
                <select
                  data-testid="preview-channel-select"
                  className="preview-channel-select"
                  value={previewChannel || ''}
                  onChange={(e) => setPreviewChannel(e.target.value || null)}
                >
                  <option value="" data-testid="preview-channel-option-admin">Admin view</option>
                  <option value="dinein" data-testid="preview-channel-option-dinein">Dine-in customer</option>
                  <option value="takeaway" data-testid="preview-channel-option-takeaway">Takeaway customer</option>
                  <option value="delivery" data-testid="preview-channel-option-delivery">Delivery customer</option>
                </select>
              </label>
            </div>

            <div className="menu-order-info">
              <span className="info-icon">💡</span>
              <span>Drag categories to reorder. Click to expand and manage items.</span>
            </div>
          </>
        )}

        {/* Categories List for Selected Station */}
        {selectedStation && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={(event) => {
              const { active, over } = event;
              setActiveId(null);
              if (!over || active.id === over.id) return;
              const cats = getMergedStationCats(selectedStation);
              const oldIndex = cats.findIndex((c) => c.id === active.id);
              const newIndex = cats.findIndex((c) => c.id === over.id);
              if (oldIndex !== -1 && newIndex !== -1) {
                updateStationCatConfig(selectedStation, arrayMove(cats, oldIndex, newIndex));
              }
            }}
          >
            <SortableContext
              items={stationCats.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="categories-list" data-testid="categories-list">
                {stationCats.map((cat, cIdx) => {
                  const items = getMergedStationItems(selectedStation, cat.id);
                  return (
                    <SortableItem key={cat.id} id={cat.id}>
                      {({ listeners, isDragging }) => (
                        <CategoryCard
                          cat={cat}
                          index={cIdx}
                          items={items}
                          expanded={expandedCategories[cat.id]}
                          onToggleExpand={() =>
                            setExpandedCategories((prev) => ({
                              ...prev,
                              [cat.id]: !prev[cat.id],
                            }))
                          }
                          onToggleVisibility={() => {
                            const cats = getMergedStationCats(selectedStation);
                            const updated = cats.map((c) =>
                              c.id === cat.id ? { ...c, visible: !c.visible } : c
                            );
                            updateStationCatConfig(selectedStation, updated);
                          }}
                          onItemReorder={(newItems) =>
                            updateStationItemConfig(selectedStation, cat.id, newItems)
                          }
                          onItemToggle={(iIdx) => {
                            const updated = [...items];
                            updated[iIdx] = {
                              ...updated[iIdx],
                              visible: !updated[iIdx].visible,
                            };
                            updateStationItemConfig(selectedStation, cat.id, updated);
                          }}
                          listeners={listeners}
                          isDragging={isDragging}
                          categoryTiming={config.categoryTimings?.[cat.id]}
                          itemTimings={config.itemTimings}
                          onCategoryTimingChange={(t) => updateCategoryTiming(cat.id, t)}
                          onCategoryTimingReset={() => resetCategoryTiming(cat.id)}
                          onItemTimingChange={(itemId, t) => updateItemTiming(itemId, t)}
                          onItemTimingReset={(itemId) => resetItemTiming(itemId)}
                          // CR-2026-06-17-001 APP-3: Channel override props (multi-menu path)
                          categoryChannels={config.channelOverrides?.category?.[cat.id]}
                          itemChannels={config.channelOverrides?.item}
                          onCategoryChannelChange={(c) => updateCategoryChannel(cat.id, c)}
                          onItemChannelChange={(itemId, c) => updateItemChannel(itemId, c)}
                          // CR-2026-06-17-002 APP-7: Preview muting props
                          previewChannel={previewChannel}
                          isCategoryMuted={isCategoryMutedInPreview(cat)}
                          isItemMuted={(item) => isItemMutedInPreview(cat, item)}
                          // CR-2026-06-17-002 APP-10: Save discoverability
                          onInlineEdit={showSaveReminder}
                        />
                      )}
                    </SortableItem>
                  );
                })}
              </div>
            </SortableContext>

            <DragOverlay>
              {activeId && (
                <div className="drag-overlay-item">
                  {stationCats.find((c) => c.id === activeId)?.name || 'Category'}
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}

        {/* Empty State */}
        {selectedStation && stationCats.length === 0 && !loading && (
          <div className="menu-order-empty">
            <span className="empty-icon">📋</span>
            <h3>No Categories Found</h3>
            <p>No categories available for {selectedStationData?.name || 'this menu'}.</p>
          </div>
        )}

        {/* No Station Selected */}
        {!selectedStation && !loading && (
          <div className="menu-order-empty">
            <span className="empty-icon">👆</span>
            <h3>Select a Menu</h3>
            <p>Choose a menu from the pills above to manage its categories.</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="menu-order-loading">
            <div className="loading-spinner" />
            <span>Loading menu data...</span>
          </div>
        )}
      </div>
    );
  }

  // ============ RENDER: SINGLE MENU (2-layer + items) ============
  const categories = filterBySearch(getMergedCategories());

  if (categories.length === 0 && !searchTerm) {
    return (
      <div className="menu-order-empty">
        <span className="empty-icon">📋</span>
        <h3>No Categories Found</h3>
        <p>Add menu items to your restaurant to organize them here.</p>
      </div>
    );
  }

  return (
    <div className="menu-order-tab modern" data-testid="menu-order-tab">
      <div className="menu-order-toolbar">
        <div className="search-box">
          <IoSearch className="search-icon" />
          <input
            type="text"
            placeholder="Search categories..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            data-testid="menu-search"
          />
        </div>
        {/* CR-2026-06-17-002 APP-7: Preview channel selector */}
        <label className="preview-channel-label">
          Preview as:
          <select
            data-testid="preview-channel-select"
            className="preview-channel-select"
            value={previewChannel || ''}
            onChange={(e) => setPreviewChannel(e.target.value || null)}
          >
            <option value="" data-testid="preview-channel-option-admin">Admin view</option>
            <option value="dinein" data-testid="preview-channel-option-dinein">Dine-in customer</option>
            <option value="takeaway" data-testid="preview-channel-option-takeaway">Takeaway customer</option>
            <option value="delivery" data-testid="preview-channel-option-delivery">Delivery customer</option>
          </select>
        </label>
        <button className="refresh-btn" onClick={fetchCategories} data-testid="menu-order-refresh">
          <IoRefresh /> Refresh
        </button>
      </div>

      <div className="menu-order-info">
        <span className="info-icon">💡</span>
        <span>Drag categories using the handle (⋮⋮) to reorder. Click to expand and manage items.</span>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={categories.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="categories-list" data-testid="menu-order-list">
            {categories.map((cat, cIdx) => {
              const items = getMergedItems(cat.id);
              return (
                <SortableItem key={cat.id} id={cat.id}>
                  {({ listeners, isDragging }) => (
                    <CategoryCard
                      cat={cat}
                      index={cIdx}
                      items={items}
                      expanded={expandedCategories[cat.id]}
                      onToggleExpand={() =>
                        setExpandedCategories((prev) => ({
                          ...prev,
                          [cat.id]: !prev[cat.id],
                        }))
                      }
                      onToggleVisibility={() => {
                        const updated = getMergedCategories().map((c) =>
                          c.id === cat.id ? { ...c, visible: !c.visible } : c
                        );
                        updateCategoryConfig(updated);
                      }}
                      onItemReorder={(newItems) => updateItemConfig(cat.id, newItems)}
                      onItemToggle={(iIdx) => {
                        const updated = [...items];
                        updated[iIdx] = { ...updated[iIdx], visible: !updated[iIdx].visible };
                        updateItemConfig(cat.id, updated);
                      }}
                      listeners={listeners}
                      isDragging={isDragging}
                      categoryTiming={config.categoryTimings?.[cat.id]}
                      itemTimings={config.itemTimings}
                      onCategoryTimingChange={(t) => updateCategoryTiming(cat.id, t)}
                      onCategoryTimingReset={() => resetCategoryTiming(cat.id)}
                      onItemTimingChange={(itemId, t) => updateItemTiming(itemId, t)}
                      onItemTimingReset={(itemId) => resetItemTiming(itemId)}
                      // CR-2026-06-17-001 APP-3: Channel override props (single-menu path)
                      categoryChannels={config.channelOverrides?.category?.[cat.id]}
                      itemChannels={config.channelOverrides?.item}
                      onCategoryChannelChange={(c) => updateCategoryChannel(cat.id, c)}
                      onItemChannelChange={(itemId, c) => updateItemChannel(itemId, c)}
                      // CR-2026-06-17-002 APP-7: Preview muting props
                      previewChannel={previewChannel}
                      isCategoryMuted={isCategoryMutedInPreview(cat)}
                      isItemMuted={(item) => isItemMutedInPreview(cat, item)}
                      // CR-2026-06-17-002 APP-10: Save discoverability
                      onInlineEdit={showSaveReminder}
                    />
                  )}
                </SortableItem>
              );
            })}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeId && (
            <div className="drag-overlay-item">
              {categories.find((c) => c.id === activeId)?.name || 'Category'}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {categories.length === 0 && searchTerm && (
        <div className="no-results">
          <span>No categories match "{searchTerm}"</span>
        </div>
      )}
    </div>
  );
};

export default MenuOrderTab;
