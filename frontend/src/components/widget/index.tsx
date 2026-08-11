import React, { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import tailwindStyles from '../../app/globals.css?inline'
import { AppShell } from '../app-shell'
import { ChatProvider } from '../../lib/chat-store'
import { SkillsProvider } from '../../lib/skills-store'
import { AgentRuntimeProvider } from '../../lib/agent-runtime'
import { NavigationProvider } from '../../lib/navigation'
import { Toaster } from '../ui/sonner'

/**
 * Embeddable HR Copilot shell — same provider tree + AppShell as the Next.js
 * app page, mounted into a closed shadow root for host-page isolation.
 */
const WidgetApp = ({
  initialToken,
  apiUrl,
  tenantId,
}: {
  initialToken?: string | null
  apiUrl?: string | null
  tenantId?: string | null
}) => {
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // In production, verify event.origin
      if (event.data?.type === 'HR_COPILOT_UPDATE_TOKEN') {
        const newToken = event.data.token
        console.log('Widget received new token:', newToken)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  useEffect(() => {
    ;(window as any).__HR_COPILOT_WIDGET__ = {
      tenantId: tenantId ?? null,
      apiUrl: apiUrl ?? null,
      jwtToken: initialToken ?? null,
    }
  }, [tenantId, apiUrl, initialToken])

  return (
    <div className="hr-copilot-widget-root h-full w-full overflow-hidden bg-background text-foreground antialiased">
      <AgentRuntimeProvider>
        <ChatProvider>
          <SkillsProvider>
            <NavigationProvider>
              <AppShell />
              <Toaster theme="dark" position="bottom-center" />
            </NavigationProvider>
          </SkillsProvider>
        </ChatProvider>
      </AgentRuntimeProvider>
    </div>
  )
}

class HRCopilotWidgetElement extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return

    const shadowRoot = this.attachShadow({ mode: 'open' })

    const style = document.createElement('style')
    style.textContent = tailwindStyles
    shadowRoot.appendChild(style)

    const mountPoint = document.createElement('div')
    mountPoint.style.width = '100%'
    mountPoint.style.height = '100%'
    shadowRoot.appendChild(mountPoint)

    const root = createRoot(mountPoint)

    root.render(
      <React.StrictMode>
        <WidgetApp
          tenantId={this.getAttribute('tenant-id')}
          apiUrl={this.getAttribute('api-url')}
          initialToken={this.getAttribute('jwt-token')}
        />
      </React.StrictMode>,
    )
  }
}

if (!customElements.get('hr-copilot-widget')) {
  customElements.define('hr-copilot-widget', HRCopilotWidgetElement)
}
