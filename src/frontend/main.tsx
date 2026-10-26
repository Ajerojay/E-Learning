import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { isMobileApp } from './MobileApp/isMobileApp'

if (import.meta.env.PROD && 'serviceWorker' in navigator && !isMobileApp()) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(error => {
      console.warn('Browser offline files could not be saved:', error);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
