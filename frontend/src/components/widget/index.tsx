import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import tailwindStyles from '../../app/globals.css?inline'; // Using vite inline CSS loader
import ChatPanel from '../chat/ChatPanel';
import DynamicCanvas from '../canvas/DynamicCanvas';

const WidgetApp = ({ initialToken, apiUrl, tenantId }: { initialToken?: string | null, apiUrl?: string | null, tenantId?: string | null }) => {
  useEffect(() => {
    // Listen for postMessage events from the host window to update JWT
    const handleMessage = (event: MessageEvent) => {
      // In production, verify event.origin
      if (event.data?.type === 'HR_COPILOT_UPDATE_TOKEN') {
        const newToken = event.data.token;
        // Logic for storing/updating JWT token can be added here or in a store.
        console.log("Widget received new token:", newToken);
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <main className="flex h-full w-full overflow-hidden bg-white">
      {/* Split-screen layout: Chat on Left, Dynamic Side Canvas on Right */}
      <section className="w-1/3 min-w-[400px] h-full shadow-lg z-10">
        <ChatPanel />
      </section>
      <section className="flex-1 h-full relative z-0">
        <DynamicCanvas />
      </section>
    </main>
  );
};

// Web Component Wrapper
class HRCopilotWidgetElement extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;

    const shadowRoot = this.attachShadow({ mode: 'open' });
    
    // Inject Tailwind styles
    const style = document.createElement('style');
    style.textContent = tailwindStyles;
    shadowRoot.appendChild(style);
    
    // Mount React App
    const mountPoint = document.createElement('div');
    // Ensure the mount point expands to full height and width of the host element
    mountPoint.style.width = '100%';
    mountPoint.style.height = '100%';
    shadowRoot.appendChild(mountPoint);
    
    const root = createRoot(mountPoint);
    
    // Read initial configuration attributes
    const tenantId = this.getAttribute('tenant-id');
    const apiUrl = this.getAttribute('api-url');
    const jwtToken = this.getAttribute('jwt-token');
    
    root.render(
      <React.StrictMode>
        <WidgetApp 
          tenantId={tenantId} 
          apiUrl={apiUrl} 
          initialToken={jwtToken} 
        />
      </React.StrictMode>
    );
  }
}

// Define the custom element
if (!customElements.get('hr-copilot-widget')) {
  customElements.define('hr-copilot-widget', HRCopilotWidgetElement);
}
