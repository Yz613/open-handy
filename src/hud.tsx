import React from 'react';
import ReactDOM from 'react-dom/client';
import { FloatingHUD } from './components/FloatingHUD';
import './styles/globals.css';

const rootElement = document.getElementById('hud-root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <FloatingHUD />
    </React.StrictMode>
  );
}
