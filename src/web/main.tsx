import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { bootstrapTheme } from './lib/theme.js';
import './styles.css';

bootstrapTheme();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
