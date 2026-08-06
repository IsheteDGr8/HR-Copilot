import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import tailwindStyles from '../../app/globals.css?inline'; // Using vite inline CSS loader

// Basic UI components for the widget
const WidgetUI = ({ tenantId, apiUrl, initialToken }) => {
  const [token, setToken] = useState(initialToken);
  const [isOpen, setIsOpen] = useState(false);
  
  useEffect(() => {
    // Listen for postMessage events from the host window to update JWT
    const handleMessage = (event) => {
      // In production, verify event.origin
      if (event.data?.type === 'HR_COPILOT_UPDATE_TOKEN') {
        setToken(event.data.token);
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {isOpen && (
        <div className="w-80 h-96 bg-white border border-gray-200 rounded-lg shadow-xl mb-4 flex flex-col overflow-hidden font-sans">
          <div className="bg-blue-600 text-white p-3 font-semibold">
            HR Copilot
          </div>
          <div className="flex-1 p-4 overflow-y-auto">
            <p className="text-sm text-gray-600">Hello! I'm your AI HR assistant. How can I help you today?</p>
            {/* Chat interface would go here */}
          </div>
          <div className="p-3 border-t border-gray-200">
            <input 
              type="text" 
              placeholder="Ask a question..." 
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      )}
      
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center shadow-lg text-white hover:bg-blue-700 transition-colors"
      >
        {isOpen ? '✕' : '💬'}
      </button>
    </div>
  );
};

// Web Component Wrapper
class HRCopilotWidgetElement extends HTMLElement {
  connectedCallback() {
    const shadowRoot = this.attachShadow({ mode: 'open' });
    
    // Inject Tailwind styles
    const style = document.createElement('style');
    style.textContent = tailwindStyles;
    shadowRoot.appendChild(style);
    
    // Mount React App
    const mountPoint = document.createElement('div');
    shadowRoot.appendChild(mountPoint);
    
    const root = createRoot(mountPoint);
    
    // Read attributes
    const tenantId = this.getAttribute('tenant-id');
    const apiUrl = this.getAttribute('api-url');
    const jwtToken = this.getAttribute('jwt-token');
    
    root.render(
      <React.StrictMode>
        <WidgetUI 
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
