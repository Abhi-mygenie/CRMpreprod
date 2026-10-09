/**
 * Order Service - JavaScript wrapper
 * Re-exports from TypeScript implementation for bundler compatibility
 */

// Re-export everything from the TypeScript implementation
export * from './orderService.ts';

// Also provide named exports for common functions
export {
  checkTableStatus,
  getOrderDetails,
  placeOrder,
  updateCustomerOrder,
} from './orderService.ts';
