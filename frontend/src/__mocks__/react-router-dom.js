/* eslint-disable no-undef */
/* global jest */
const mockNavigate = jest.fn();
const mockLocation = { pathname: '/478/menu', search: '', hash: '', state: null };

module.exports = {
  useNavigate: () => mockNavigate,
  useLocation: () => mockLocation,
  useParams: () => ({}),
  useSearchParams: () => [new URLSearchParams(), jest.fn()],
  BrowserRouter: ({ children }) => children,
  Routes: ({ children }) => children,
  Route: () => null,
  Link: ({ children, to, ...props }) => {
    const React = require('react');
    return React.createElement('a', { href: to, ...props }, children);
  },
  __mockNavigate: mockNavigate,
  __mockLocation: mockLocation,
};
