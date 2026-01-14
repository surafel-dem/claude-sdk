import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ConvexReactClient } from 'convex/react';
import { ConvexBetterAuthProvider } from '@convex-dev/better-auth/react';
import { authClient } from './lib/auth-client';
import './index.css';
import App from './App.tsx';

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ConvexBetterAuthProvider client={convex} authClient={authClient}>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/chat" element={<App />} />
          <Route path="/chat/:threadId" element={<App />} />
        </Routes>
      </ConvexBetterAuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
