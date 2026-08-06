import { useStore } from '../store/useStore';

export const setupSSEListener = (endpoint: string, jwtToken: string | null) => {
  return {
    sendMessage: async (message: string) => {
      const store = useStore.getState();
      // Add user message immediately
      store.addMessage({ role: 'user', content: message });
      
      // Initialize an empty assistant message
      const assistantMessageIndex = store.messages.length; // +1 since we just added user, but state update might be queued
      store.addMessage({ role: 'assistant', content: '' });

      try {
        const response = await fetch(`${endpoint}?message=${encodeURIComponent(message)}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${jwtToken || 'mock-jwt-token'}`
          }
        });

        if (!response.body) throw new Error("No response body");
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        let assistantContent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.replace('data: ', '');
              if (!dataStr) continue;
              
              try {
                const data = JSON.parse(dataStr);
                
                if (data.event === 'delta' && data.data) {
                  assistantContent += data.data;
                  // Update the last message in the store
                  useStore.setState(state => {
                    const newMessages = [...state.messages];
                    newMessages[newMessages.length - 1] = { 
                      ...newMessages[newMessages.length - 1], 
                      content: assistantContent 
                    };
                    return { messages: newMessages };
                  });
                }
                else if (data.event === 'canvas_update') {
                  useStore.getState().setCanvasState({ 
                    view: data.data.view, 
                    data: data.data.data 
                  });
                }
                else if (data.event === 'tool_start') {
                  // Optionally show "tool running" status in chat
                }
              } catch (e) {
                console.error("Error parsing SSE data", e);
              }
            }
          }
        }
      } catch (error) {
        console.error("SSE Error:", error);
      }
    }
  };
};
