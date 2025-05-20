import { io, Socket } from 'socket.io-client';
import { Message, ChatConfig } from '../types';

export class ChatService {
  private socket: Socket | null = null;
  private config: ChatConfig;

  constructor(config: ChatConfig) {
    this.config = config;
    this.initialize();
  }

  private initialize() {
    console.log('Initializing chat service with config:', this.config);
    
    this.socket = io(this.config.serverUrl);
    
    this.socket.on('connect', () => {
      console.log('Connected to chat server');
      this.socket?.emit('register', this.config.userId);
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
    });

    // Change from 'message' to 'receive_message' to match server event
    this.socket.on('receive_message', (message: Message) => {
      console.log('Message received:', message);
      this.config.onMessageReceived?.(message);
    });
  }

  public async sendMessage(receiverId: string, content: string): Promise<boolean> {
    if (!this.socket?.connected) {
      console.error('Not connected to chat server');
      return false;
    }

    try {
      const message: Message = {
        id: Math.random().toString(36).substr(2, 9),
        content,
        senderId: this.config.userId,
        receiverId,
        timestamp: Date.now()
      };

      console.log('Sending message:', message);
      
      return new Promise((resolve) => {
        this.socket?.emit('send_message', message, (acknowledgement: any) => {
          console.log('Message acknowledgement:', acknowledgement);
          if (acknowledgement?.success) {
            // Also call the message received handler for the sender's UI
            this.config.onMessageReceived?.(message);
            resolve(true);
          } else {
            console.error('Failed to send message:', acknowledgement?.error);
            resolve(false);
          }
        });
      });
    } catch (error) {
      console.error('Error in sendMessage:', error);
      return false;
    }
  }

  public disconnect(): void {
    if (this.socket?.connected) {
      this.socket.disconnect();
    }
    this.socket = null;
  }
}