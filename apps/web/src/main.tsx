import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { Foundation } from './app/Foundation';
import { ErrorBoundary } from './app/ErrorBoundary';
import './styles/base.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>{location.pathname === '/foundation' ? <Foundation /> : <App />}</ErrorBoundary>
  </StrictMode>,
);
