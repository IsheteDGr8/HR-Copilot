import { AppShell } from "@/components/app-shell"
import { AuthGate } from "@/components/auth-gate"
import { ChatProvider } from "@/lib/chat-store"
import { SkillsProvider } from "@/lib/skills-store"
import { McpProvider } from "@/lib/mcp-store"
import { AgentRuntimeProvider } from "@/lib/agent-runtime"
import { NavigationProvider } from "@/lib/navigation"
import { Toaster } from "@/components/ui/sonner"

export default function ToolsRoutePage() {
  return (
    <AgentRuntimeProvider>
      <ChatProvider>
        <SkillsProvider>
          <McpProvider>
            <NavigationProvider initialView="tools">
              <AuthGate>
                <AppShell />
                <Toaster theme="light" position="bottom-center" />
              </AuthGate>
            </NavigationProvider>
          </McpProvider>
        </SkillsProvider>
      </ChatProvider>
    </AgentRuntimeProvider>
  )
}
