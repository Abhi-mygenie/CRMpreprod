/* Standalone CommonJS unit test for channelEligibility helpers (Cases 1 & 1b). */
const Module = require('module');
const fs = require('fs');
const path = require('path');

// Read the ESM file and strip `export ` so we can eval as CJS-ish.
const srcPath = path.resolve(__dirname, '../channelEligibility.js');
let src = fs.readFileSync(srcPath, 'utf8');
src = src.replace(/export const /g, 'const ');
src += '\nmodule.exports = { isItemAllowedForChannel, getChannelLabel };';

const m = new Module(srcPath);
m._compile(src, srcPath);
const { isItemAllowedForChannel, getChannelLabel } = m.exports;

let pass = 0, fail = 0;
const eq = (label, actual, expected) => {
  const ok = actual === expected;
  if (ok) { pass++; console.log(`PASS  ${label}`); }
  else    { fail++; console.log(`FAIL  ${label}  expected=${expected}  actual=${actual}`); }
};

// ────── Case 1: isItemAllowedForChannel — 6 shapes × 4 channels ──────
const allYes      = { id: 1, name: 'A', dinein: 'Yes', takeaway: 'Yes', delivery: 'Yes' };
const dineinOnly  = { id: 2, name: 'B', dinein: 'Yes', takeaway: 'No',  delivery: 'No'  };
const deliveryOnly= { id: 3, name: 'C', dinein: 'No',  takeaway: 'No',  delivery: 'Yes' };
const takeawayOnly= { id: 4, name: 'D', dinein: 'No',  takeaway: 'Yes', delivery: 'No'  };
const legacy      = { id: 5, name: 'E' };                        // no flags
const allNo       = { id: 6, name: 'F', dinein: 'No',  takeaway: 'No',  delivery: 'No'  };

const channels = ['dinein', 'takeaway', 'take_away', 'delivery'];

// allYes -> all true
channels.forEach(c => eq(`allYes/${c}`, isItemAllowedForChannel(allYes, c), true));

// dineinOnly
eq('dineinOnly/dinein',    isItemAllowedForChannel(dineinOnly, 'dinein'),    true);
eq('dineinOnly/takeaway',  isItemAllowedForChannel(dineinOnly, 'takeaway'),  false);
eq('dineinOnly/take_away', isItemAllowedForChannel(dineinOnly, 'take_away'), false);
eq('dineinOnly/delivery',  isItemAllowedForChannel(dineinOnly, 'delivery'),  false);

// deliveryOnly
eq('deliveryOnly/dinein',    isItemAllowedForChannel(deliveryOnly, 'dinein'),    false);
eq('deliveryOnly/takeaway',  isItemAllowedForChannel(deliveryOnly, 'takeaway'),  false);
eq('deliveryOnly/take_away', isItemAllowedForChannel(deliveryOnly, 'take_away'), false);
eq('deliveryOnly/delivery',  isItemAllowedForChannel(deliveryOnly, 'delivery'),  true);

// takeawayOnly  -> takeaway AND take_away true; rest false
eq('takeawayOnly/dinein',    isItemAllowedForChannel(takeawayOnly, 'dinein'),    false);
eq('takeawayOnly/takeaway',  isItemAllowedForChannel(takeawayOnly, 'takeaway'),  true);
eq('takeawayOnly/take_away', isItemAllowedForChannel(takeawayOnly, 'take_away'), true);
eq('takeawayOnly/delivery',  isItemAllowedForChannel(takeawayOnly, 'delivery'),  false);

// legacy item with no flags -> permissive (true) on every channel
channels.forEach(c => eq(`legacy/${c}`, isItemAllowedForChannel(legacy, c), true));

// allNo -> false everywhere
channels.forEach(c => eq(`allNo/${c}`, isItemAllowedForChannel(allNo, c), false));

// Edge cases — null / unknown orderType
eq('allNo/null-orderType',     isItemAllowedForChannel(allNo, null),         true);  // permissive
eq('allNo/undefined-orderType',isItemAllowedForChannel(allNo, undefined),    true);
eq('allNo/empty-string',       isItemAllowedForChannel(allNo, ''),           true);  // !orderType is true
eq('allNo/unknown',            isItemAllowedForChannel(allNo, 'curbside'),   true);  // default branch
eq('null-item/dinein',         isItemAllowedForChannel(null, 'dinein'),      false);
eq('undefined-item/dinein',    isItemAllowedForChannel(undefined, 'dinein'), false);

// ────── Case 1b: getChannelLabel ──────
eq('label/dinein',     getChannelLabel('dinein'),     'Dine-in');
eq('label/takeaway',   getChannelLabel('takeaway'),   'Takeaway');
eq('label/take_away',  getChannelLabel('take_away'),  'Takeaway');
eq('label/delivery',   getChannelLabel('delivery'),   'Delivery');
eq('label/null',       getChannelLabel(null),         'this order type');
eq('label/unknown',    getChannelLabel('curbside'),   'this order type');

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
