// import React from 'react';
// import './MenuPanel.css';

// const MenuPanel = ({
//   isOpen,
//   onClose,
//   stationName,
//   menuSections,
//   stationsData,
//   currentStationId,
//   onCategoryClick,
//   onStationClick
// }) => {
//   if (!isOpen) return null;

//   return (
//     <>
//       <div className="menu-panel-overlay" onClick={onClose}></div>
//       <div className="menu-panel">
//         <div className="menu-panel-content">


//           {/* Categories Heading */}
//           <div className="menu-panel-header">
//             <h3 className="menu-panel-header-title">Categories</h3>
//           </div>


//           {/* Current Station Categories */}
//           {menuSections.length > 0 && (
//             <div className="menu-panel-section">
//               <h3 className="menu-panel-section-title">{stationName }</h3>
//               <div className="menu-panel-items">
//                 {menuSections.map((section, index) => (
//                   <button
//                     key={index}
//                     className="menu-panel-item category-item"
//                     onClick={() => onCategoryClick(section.sectionName)}
//                   >
//                     {section.sectionName}
//                   </button>
//                 ))}
//               </div>
//             </div>
//           )}

//           {/* All Other Stations - Only show if stationsData exists and has items */}
//           {stationsData && stationsData.length > 0 && (
//             <div className="menu-panel-section">
//               <div className="menu-panel-items">
//                 {stationsData
//                   .filter((station) => station.id !== currentStationId)
//                   .map((station) => (
//                     <button
//                       key={station.id}
//                       className="menu-panel-item station-item"
//                       onClick={() => onStationClick(station.id)}
//                     >
//                       {station.name}
//                     </button>
//                   ))}
//               </div>
//             </div>
//           )}
//         </div>
//       </div>
//     </>
//   );
// };

// export default MenuPanel;

import React from 'react';
import './MenuPanel.css';
import { createPortal } from "react-dom";

const MenuPanel = ({
  isOpen,
  onClose,
  stationName,
  menuSections,
  stationsData,
  currentStationId,
  onCategoryClick,
  onStationClick,
  selectedCategory
}) => {
  if (!isOpen) return null;

  // Determine if we should show stations or categories
  const showStations = stationsData && stationsData.length > 0;

  return createPortal(
    <>
      {/* Overlay */}
      <div className="menu-panel-overlay" onClick={onClose}></div>

      {/* Sidebar Drawer */}
      <aside className="menu-panel">

        {/* Header */}
        <div className="menu-panel-header">
          <h2 className="menu-panel-title">Category</h2>
        </div>

        <div className="menu-panel-content">

          {/* For multi-menu restaurants: Show Stations */}
          {showStations && (
            <>
              {/* Active Station Block */}
              {stationName && (
                <div className="menu-panel-station-block">
                  <div className="menu-panel-station-active">
                    <span className="menu-panel-station-name">
                      {stationName}
                    </span>
                  </div>

                  {menuSections.map((section, index) => (
                    <button
                      key={index}
                      className={`menu-panel-item category-item ${
                        selectedCategory === section.sectionName ? 'active' : ''
                      }`}
                      onClick={() => onCategoryClick(section.sectionName)}
                    >
                      {section.sectionName}
                    </button>
                  ))}
                </div>
              )}

              {/* Other Stations */}
              <div className="menu-panel-stations-block">
                {stationsData
                  .filter((station) => station.id !== currentStationId)
                  .map((station) => (
                    <button
                      key={station.id}
                      className="menu-panel-item station-item"
                      onClick={() => onStationClick(station.id)}
                    >
                      {station.name}
                    </button>
                  ))}
              </div>
            </>
          )}

          {/* For non-multiple_menu restaurants: Show Categories from menuSections */}
          {!showStations && menuSections && menuSections.length > 0 && (
            <div className="menu-panel-categories-block">
              {menuSections.map((section, index) => (
                <button
                  key={index}
                  className={`category-compact-item ${
                    selectedCategory === section.sectionName ? 'active' : ''
                  }`}
                  onClick={() => onCategoryClick(section.sectionName)}
                >
                  {section.sectionName}
                </button>
              ))}
            </div>
          )}

        </div>
      </aside>
    </>,
    document.body
  );
};

export default MenuPanel;
