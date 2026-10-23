import '@fontsource/onest/400.css';
import '@fontsource/onest/500.css';
import '@fontsource/onest/600.css';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import './styles/tokens.css';
import './styles/base.css';
import {App} from './App';
import {loadPersisted} from './store/persist';

// Apply the saved theme before the first paint to avoid a flash.
const saved = loadPersisted().theme;
if (saved && saved !== 'system') document.documentElement.dataset.theme = saved;

const root = document.getElementById('root');
if (!root) throw new Error('No #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
