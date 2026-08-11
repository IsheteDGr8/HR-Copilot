import { AppShell } from "@/components/app-shell"
import { ChatProvider } from "@/lib/chat-store"
import { SkillsProvider } from "@/lib/skills-store"
import { AgentRuntimeProvider } from "@/lib/agent-runtime"
import { NavigationProvider } from "@/lib/navigation"
import { Toaster } from "@/components/ui/sonner"

export default function Home() {
  return (
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
  )
}
