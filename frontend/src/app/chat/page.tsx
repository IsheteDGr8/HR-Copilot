import { AppShell } from "@/components/app-shell"
import { AuthGate } from "@/components/auth-gate"
import { ChatProvider } from "@/lib/chat-store"
import { SkillsProvider } from "@/lib/skills-store"
// TODO: restore once frontend/src/lib/mcp-store.ts exists again — it's
// currently missing from the project, unrelated to the landing page work.
// import { McpProvider } from "@/lib/mcp-store"
import { AgentRuntimeProvider } from "@/lib/agent-runtime"
import { NavigationProvider } from "@/lib/navigation"
import { Toaster } from "@/components/ui/sonner"

export default function Home() {
  return (
    <AgentRuntimeProvider>
      <ChatProvider>
        <SkillsProvider>
          <NavigationProvider>
            <AuthGate>
              <AppShell />
              <Toaster theme="dark" position="bottom-center" />
            </AuthGate>
          </NavigationProvider>
        </SkillsProvider>
      </ChatProvider>
    </AgentRuntimeProvider>
  )
}
