import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { registerModelCacheServiceWorker } from './models/modelCacheServiceWorker';

if ('serviceWorker' in navigator) {
  void registerModelCacheServiceWorker().catch((error) => {
    console.error('Model cache service worker registration failed:', error);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
