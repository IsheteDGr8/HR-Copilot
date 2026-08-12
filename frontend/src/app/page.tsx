import { AppShell } from "@/components/app-shell"
import { ChatProvider } from "@/lib/chat-store"
import { SkillsProvider } from "@/lib/skills-store"
import { AgentRuntimeProvider } from "@/lib/agent-runtime"
import { NavigationProvider } from "@/lib/navigation"
import { Toaster } from "@/components/ui/sonner"
import { AuthGate } from "@/components/auth-gate"

export default function Home() {
  return (
    <AuthGate>
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
    </AuthGate>
  )
}
