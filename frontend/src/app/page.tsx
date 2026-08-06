import ChatPanel from '../components/chat/ChatPanel';
import DynamicCanvas from '../components/canvas/DynamicCanvas';

export default function Home() {
  return (
    <main className="flex h-screen w-full overflow-hidden bg-white">
      {/* Split-screen layout: Chat on Left, Dynamic Side Canvas on Right */}
      <section className="w-1/3 min-w-[400px] h-full shadow-lg z-10">
        <ChatPanel />
      </section>
      <section className="flex-1 h-full relative z-0">
        <DynamicCanvas />
      </section>
    </main>
  );
}
