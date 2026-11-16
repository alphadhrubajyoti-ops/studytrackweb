import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/figtree';
import '@fontsource-variable/literata';
import './index.css';
import App from './App';
import { ErrorBoundary } from './ErrorBoundary';
import { setupServiceWorker } from './pwa/register';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

if (import.meta.env.PROD) setupServiceWorker();
