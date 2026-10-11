import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App';
import { AuthProvider } from './auth/AuthProvider';
import { Toaster } from './components/ui/toaster';
import { changeLanguage, readStoredLanguage } from './i18n';
import { applyFontScale, readStoredFontScale } from './preferences/preferences';
import { PreferencesProvider } from './preferences/PreferencesProvider';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function render() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <PreferencesProvider>
            <AuthProvider>
              <App />
              <Toaster />
            </AuthProvider>
          </PreferencesProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
}

// Apply the saved text size and language before the first paint, so nothing jumps or flashes in English.
applyFontScale(readStoredFontScale());
const saved = readStoredLanguage();
if (saved === 'ur') {
  changeLanguage('ur').then(render, render);
} else {
  render();
}
