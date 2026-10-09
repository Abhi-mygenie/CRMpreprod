/**
 * CA-006: Feature-flag logger utility
 * 
 * In dev mode: all logs print (same as today)
 * In prod mode: silent by default, enable per-domain via localStorage:
 *   localStorage.setItem('debug:order', 'true')
 *   localStorage.setItem('debug:razorpay', 'true')
 *   localStorage.setItem('debug:*', 'true')         // enable all
 * 
 * Errors (logger.error) always print everywhere.
 */

const isDev = process.env.NODE_ENV !== 'production';

const isEnabled = (domain) => {
  if (isDev) return true;
  try {
    return localStorage.getItem(`debug:${domain}`) === 'true'
      || localStorage.getItem('debug:*') === 'true';
  } catch {
    return false;
  }
};

const createDomainLogger = (domain) => {
  const tag = `[${domain.toUpperCase()}]`;
  return (...args) => {
    if (isEnabled(domain)) console.log(tag, ...args);
  };
};

const logger = {
  order: createDomainLogger('order'),
  razorpay: createDomainLogger('razorpay'),
  auth: createDomainLogger('auth'),
  tax: createDomainLogger('tax'),
  menu: createDomainLogger('menu'),
  cart: createDomainLogger('cart'),
  table: createDomainLogger('table'),
  payment: createDomainLogger('payment'),
  api: createDomainLogger('api'),
  admin: createDomainLogger('admin'),
  // Errors always print — never silenced
  error: (domain, ...args) => {
    console.error(`[${domain.toUpperCase()}]`, ...args);
  },
};

export default logger;
