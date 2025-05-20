import React, { useEffect, useState, useRef } from 'react';
import { ChatService } from '../services/ChatService';
import { Message } from '../types';
import './styles.css';

export interface ChatProps {
  userId: string;
  threadId?: string;
  receiverId: string;
  serverUrl: string;
}

export const Chat: React.FC<ChatProps> = ({ userId, threadId, receiverId, serverUrl }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [chatService, setChatService] = useState<ChatService | null>(null);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userId) {
      console.error("Chat component requires a userId");
      return;
    }

    const service = new ChatService({
      userId,
      serverUrl,
      onMessageReceived: (message) => {
        console.log("Message received in component:", message);
        setMessages(prev => {
          // Avoid duplicate messages
          if (prev.some(m => m.id === message.id)) {
            return prev;
          }
          return [...prev, message];
        });
      }
    });

    setChatService(service);

    return () => {
      service.disconnect();
    };
  }, [userId, serverUrl]);

  useEffect(() => {
    // Scroll to bottom whenever messages change
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !chatService || isSending) return;

    try {
      setIsSending(true);
      const sent = await chatService.sendMessage(receiverId, inputMessage.trim());
      
      if (sent) {
        setInputMessage('');
      } else {
        console.error("Failed to send message");
        // Optionally show an error to the user
      }
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.length === 0 && (
          <div className="no-messages">No messages yet</div>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`message ${message.senderId === userId ? 'sent' : 'received'}`}
          >
            <p>{message.content}</p>
            <small>{new Date(message.timestamp).toLocaleTimeString()}</small>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="input-area">
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder="Type a message..."
          disabled={isSending}
        />
        <button 
          onClick={handleSendMessage} 
          disabled={isSending || !inputMessage.trim()}
        >
          {isSending ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
};