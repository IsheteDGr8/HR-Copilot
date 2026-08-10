'use client';
import React, { useState } from 'react';
import { useStore } from '../../store/useStore';
import { setupSSEListener } from '../../lib/sse';
import { Send, User, Bot } from 'lucide-react';

export default function ChatPanel() {
  const { messages } = useStore();
  const [input, setInput] = useState('');
  
  // Use absolute URL for the widget
  const sseClient = setupSSEListener('http://localhost:8000/api/v1/chat/stream', 'mock-jwt-token');

  const handleSend = () => {
    if (!input.trim()) return;
    sseClient.sendMessage(input);
    setInput('');
  };

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      <div className="p-4 bg-gray-50 border-b border-gray-200">
        <h2 className="text-xl font-semibold text-gray-800">HR Copilot</h2>
        <p className="text-sm text-gray-500">Ask about policies, PTO, or benefits.</p>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                <Bot size={18} />
              </div>
            )}
            <div className={`px-4 py-2 rounded-lg max-w-[80%] ${
              msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'
            }`}>
              {msg.content}
            </div>
            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600">
                <User size={18} />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-gray-200">
        <div className="flex relative items-center">
          <input
            type="text"
            className="w-full pl-4 pr-12 py-3 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
            placeholder="Type your message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />
          <button 
            onClick={handleSend}
            className="absolute right-2 p-2 text-white bg-blue-600 hover:bg-blue-700 rounded-full transition-colors"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
