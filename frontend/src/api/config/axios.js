/**
 * Axios Configuration
 * Centralized axios instance with interceptors
 */

import axios from 'axios';
import { requestInterceptor, requestErrorInterceptor } from '../interceptors/request';
import { responseInterceptor, responseErrorInterceptor } from '../interceptors/response';
import logger from '../../utils/logger';

// DFA-001 fix: No fallback — fail visibly if env var missing
if (!process.env.REACT_APP_API_BASE_URL) {
  logger.error('api', 'CRITICAL: REACT_APP_API_BASE_URL is not set in .env. API calls will fail.');
}

// CR-2026-07-03-004 — split into read (8 s) and write (15 s) clients.
// Rationale: reads should fail fast so users get error UI quickly during upstream
// slowness; writes need more headroom because business ops (order-create, edit)
// legitimately take longer, especially on flaky mobile networks.
const commonHeaders = {
  'Content-Type': 'application/json; charset=UTF-8',
  'Accept': 'application/json',
};

const apiReadClient = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL,
  timeout: 8000, // CR-2026-07-03-004 D-01
  headers: commonHeaders,
});

const apiWriteClient = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL,
  timeout: 15000, // CR-2026-07-03-004 D-01
  headers: commonHeaders,
});

// Interceptors on both clients — auth token + response handling behave identically.
[apiReadClient, apiWriteClient].forEach((client) => {
  client.interceptors.request.use(requestInterceptor, requestErrorInterceptor);
  client.interceptors.response.use(responseInterceptor, responseErrorInterceptor);
});

export { apiReadClient, apiWriteClient };

// Default export stays as read-client for backward compat with any existing
// `import apiClient from '../api/config/axios'` — reads dominate the call graph.
export default apiReadClient;
