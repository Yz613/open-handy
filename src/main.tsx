import React from 'react';
import ReactDOM from 'react-dom/client';
import { Settings } from './components/Settings';
import './styles/globals.css';

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <Settings />
    </React.StrictMode>
  );
}
