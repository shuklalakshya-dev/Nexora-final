export interface Message {
  id: string;
  content: string;
  senderId: string;
  receiverId: string;
  timestamp: number;
}

export interface ChatConfig {
  userId: string;
  serverUrl: string;
  onMessageReceived?: (message: Message) => void;
}

export interface VideoCallConfig {
  userId: string;
  serverUrl: string;
  onCallReceived?: (callerId: string) => void;
  onCallEnded?: () => void;
}

export interface VideoCallProps {
  /**
   * ID of the current user
   */
  userId: string;
  
  /**
   * ID of the user being called
   */
  receiverId: string;
  
  /**
   * URL for the WebSocket server
   * Should include protocol (e.g., "https://your-server.com")
   */
  serverUrl: string;
  
  /**
   * Display name for the current user
   * @default "You"
   */
  userName?: string;
  
  /**
   * Display name for the user being called
   * @default "User"
   */
  receiverName?: string;
  
  /**
   * Callback triggered when a call is successfully started
   */
  onCallStarted?: () => void;
  
  /**
   * Callback triggered when a call ends
   */
  onCallEnded?: () => void;
  
  /**
   * Callback for handling errors during call setup or execution
   */
  onError?: (error: Error) => void;
}