import { AppShell } from "@/components/app-shell"
import { AuthGate } from "@/components/auth-gate"
import { ChatProvider } from "@/lib/chat-store"
import { SkillsProvider } from "@/lib/skills-store"
import { AgentRuntimeProvider } from "@/lib/agent-runtime"
import { NavigationProvider } from "@/lib/navigation"
import { Toaster } from "@/components/ui/sonner"

export default function ToolsRoutePage() {
  return (
    <AgentRuntimeProvider>
      <ChatProvider>
        <SkillsProvider>
          <NavigationProvider initialView="tools">
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
