import React from 'react';
import { GiSadCrab, GiPeanut } from 'react-icons/gi';
import { LuMilk, LuBean } from 'react-icons/lu';

/**
 * Get allergen icon component based on allergen name
 * @param {string} allergenName - Name of the allergen (case-insensitive)
 * @returns {JSX.Element|null} - React component for the allergen icon or null if not found
 */
export const getAllergenIcon = (allergenName) => {
  const allergen = allergenName.toLowerCase();

  switch (allergen) {
    case 'fish':
      return (
        <svg className="item-allergen-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" title="Fish">
          <path fill="#0c3f56" d="M212.5 205.5C251.7 172.5 304.6 144 368 144C431.4 144 484.3 172.5 523.5 205.5C562.6 238.5 590.4 277.9 604.5 305.3C609.2 314.5 609.2 325.4 604.5 334.6C590.4 362 562.6 401.4 523.5 434.4C484.3 467.5 431.5 495.9 368 495.9C304.5 495.9 251.7 467.4 212.5 434.4C196.3 420.7 182 405.9 169.8 391.3L80.1 443.6C67.6 450.9 51.7 448.9 41.4 438.7C31.1 428.5 29 412.7 36.1 400.1L82 320L36.2 239.9C29 227.3 31.2 211.5 41.5 201.3C51.8 191.1 67.6 189.1 80.2 196.4L169.9 248.7C182.1 234.1 196.4 219.3 212.6 205.6zM480 320C480 302.3 465.7 288 448 288C430.3 288 416 302.3 416 320C416 337.7 430.3 352 448 352C465.7 352 480 337.7 480 320z" />
        </svg>
      );
    case 'nut':
      return (
        <GiPeanut className="item-allergen-icon" color="#0c3f56" title="Nut" />
      );
    case 'crustacean':
      return (
        <GiSadCrab className="item-allergen-icon" color="#0c3f56" title="Crustacean" />
      );
    case 'gluten':
      return (
        <svg className="item-allergen-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" title="Gluten">
          <path fill="#0c3f56" d="M111.7 298.6C117.9 294.5 126.4 295.2 131.8 300.7L177.9 346.8L184 353.5C203.7 377.3 210.3 408.5 203.2 437.4C234.9 429.7 269.4 438.4 293.8 462.7L339.9 508.8C346.1 515 346.1 525.2 339.9 531.4L332.5 538.8C295 576.3 234.2 576.3 196.7 538.8L166.1 508.3L81.4 593C72 602.4 56.9 602.4 47.5 593C38.1 583.6 38.1 568.4 47.5 559.1L132.2 474.4L101.7 443.9C64.2 406.4 64.2 345.6 101.7 308.2L109.1 300.8L111.6 298.7zM215.7 194.6C221.9 190.5 230.4 191.2 235.8 196.7L281.9 242.8L288 249.5C307.7 273.3 314.3 304.5 307.2 333.4C338.9 325.7 373.4 334.4 397.8 358.7L443.9 404.8C450.1 411 450.1 421.2 443.9 427.4L436.5 434.8C399 472.3 338.2 472.3 300.7 434.8L205.8 339.9C168.3 302.4 168.3 241.6 205.8 204.2L213.2 196.8L215.7 194.7zM527.2 79C536.6 69.6 551.8 69.6 561.2 79C570 87.8 570.5 101.7 562.8 111.2L561.2 113L446.7 227.4C454.4 228.4 461.9 230.4 469.2 233.3L527.5 175C536.9 165.6 552.1 165.6 561.5 175C570.3 183.8 570.8 197.7 563.1 207.1L561.4 208.9L508.7 261.6L547.7 300.6C553.9 306.8 553.9 317 547.7 323.2L540.3 330.6C502.8 368.1 442 368.1 404.5 330.6L309.6 235.7C272.1 198.2 272.1 137.4 309.6 100L317 92.6L319.5 90.5C325.7 86.4 334.2 87.1 339.6 92.6L378.6 131.6L431.3 78.9C440.7 69.5 455.9 69.5 465.3 78.9C474.1 87.7 474.6 101.6 466.9 111L465.2 112.8L406.9 171.1C409.7 178.2 411.6 185.6 412.6 193.2L527.2 79z" />
        </svg>
      );
    case 'dairy':
      return (
        <LuMilk className="item-allergen-icon" color="#0c3f56" title="Dairy" />
      );
    case 'soya':
    case 'soy':
      return (
        <LuBean className="item-allergen-icon" color="#0c3f56" title="Soya" />
      );
    case 'sulphites':
      return (
        <svg className="item-allergen-icon" viewBox="0 0 24 24" title="Sulphite">
          <path fill="#0c3f56" d="M7,2V4H8V18A4,4 0 0,0 12,22A4,4 0 0,0 16,18V4H17V2H7M11,16C10.4,16 10,15.6 10,15C10,14.4 10.4,14 11,14C11.6,14 12,14.4 12,15C12,15.6 11.6,16 11,16M13,12C12.4,12 12,11.6 12,11C12,10.4 12.4,10 13,10C13.6,10 14,10.4 14,11C14,11.6 13.6,12 13,12M14,7H10V4H14V7Z" />
        </svg>
      );
    case 'eggs':
    case 'egg':
      return (
        <svg className="item-allergen-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" title="Egg">
          <path fill="#0c3f56" d="M320 560C214 560 128 458 128 352C128 240 192 80 320 80C448 80 512 240 512 352C512 458 426 560 320 560zM282.8 198C289.3 192 289.8 181.9 283.8 175.4C277.8 168.9 267.7 168.4 261.2 174.4C237.3 196.2 220.1 227.1 208.9 258.6C197.7 290.2 192 323.7 192 352.1C192 360.9 199.2 368.1 208 368.1C216.8 368.1 224 360.9 224 352.1C224 327.6 229 297.7 239.1 269.3C249.2 240.8 264.1 215.2 282.8 198.1z" />
        </svg>
      );
    default:
      return null;
  }
};

export default getAllergenIcon;
