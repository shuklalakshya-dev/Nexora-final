import React, { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import './styles.css';

// Add export keyword to make the interface available outside this file
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

export const VideoCall: React.FC<VideoCallProps> = ({
  userId,
  receiverId,
  serverUrl,
  userName = 'You',
  receiverName = 'User',
  onCallStarted,
  onCallEnded,
  onError
}) => {
  const [isInCall, setIsInCall] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [isReceivingCall, setIsReceivingCall] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [callStatus, setCallStatus] = useState<'idle' | 'connecting' | 'connected' | 'ended'>('idle');
  
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [currentVideoDeviceIndex, setCurrentVideoDeviceIndex] = useState(0);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize socket connection
  useEffect(() => {
    console.log('Initializing socket with server URL:', serverUrl);
    
    const newSocket = io(serverUrl, {
      query: { userId }, // Make sure userId is passed in query
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
    });
    
    newSocket.on("connect", () => {
      console.log("Socket connected with ID:", newSocket.id);
      newSocket.emit("register", userId);
    });

    newSocket.on("connect_error", (error) => {
      console.error("Socket connection error:", error);
      onError?.(new Error(`Failed to connect to video call server: ${error.message}`));
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [serverUrl, userId, onError]);

  // Call duration timer
  useEffect(() => {
    if (isInCall && callStatus === 'connected') {
      timerRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (callStatus === 'idle') {
        setCallDuration(0);
      }
    }
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isInCall, callStatus]);

  // Handle incoming WebRTC signaling
  useEffect(() => {
    if (!socket) return;

    console.log("Setting up video call signal handlers");

    socket.on("incoming-call", ({ from }) => {
      console.log("Incoming call from:", from);
      if (from === receiverId) {
        setIsReceivingCall(true);
      }
    });

    socket.on("offer", async ({ from, offer }) => {
      console.log("Received offer from:", from);
      if (from === receiverId) {
        setCallStatus('connecting');
        await handleOffer(offer);
      }
    });

    socket.on("answer", async ({ from, answer }) => {
      console.log("Received answer from:", from);
      if (from !== receiverId) return;
      
      if (!peerConnection.current) {
        console.error("No peer connection available");
        return;
      }
      
      try {
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
        setCallStatus('connected');
        setIsInCall(true);
        setIsCalling(false);
        onCallStarted?.();
      } catch (err) {
        console.error("Error setting remote description:", err);
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    });

    socket.on("ice-candidate", async ({ candidate }) => {
      if (!peerConnection.current) return;
      try {
        if (candidate) {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    });

    socket.on("end-call", () => {
      handleEndCall();
      setCallStatus('ended');
      setTimeout(() => setCallStatus('idle'), 3000);
    });

    return () => {
      socket.off("offer");
      socket.off("answer");
      socket.off("ice-candidate");
      socket.off("end-call");
      socket.off("incoming-call");
    };
  }, [socket, onError, receiverId, onCallStarted]);

  const initializePeerConnection = () => {
    peerConnection.current = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        // Add more STUN servers
        { urls: "stun:stun.stunprotocol.org:3478" },
        { urls: "stun:stun.fwdnet.net" }
      ]
    });

    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit("ice-candidate", {
          to: receiverId,
          candidate: event.candidate
        });
      }
    };

    peerConnection.current.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    if (localStream.current) {
      localStream.current.getTracks().forEach(track => {
        if (peerConnection.current && localStream.current) {
          peerConnection.current.addTrack(track, localStream.current);
        }
      });
    }
  };

  const getVideoDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter(device => device.kind === 'videoinput');
      setVideoDevices(videoInputs);
      console.log('Available video devices:', videoInputs);
    } catch (err) {
      console.error('Error getting video devices:', err);
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }, [onError]);

  useEffect(() => {
    getVideoDevices();
  }, [getVideoDevices]);

  const switchCamera = async () => {
    if (!localStream.current || videoDevices.length <= 1) return;
    
    try {
      localStream.current.getVideoTracks().forEach(track => track.stop());
      
      const nextDeviceIndex = (currentVideoDeviceIndex + 1) % videoDevices.length;
      setCurrentVideoDeviceIndex(nextDeviceIndex);
      
      const newDeviceId = videoDevices[nextDeviceIndex].deviceId;
      console.log('Switching to camera:', videoDevices[nextDeviceIndex].label || `Device ${nextDeviceIndex + 1}`);
      
      const newVideoStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: newDeviceId } },
        audio: false
      });
      
      const newVideoTrack = newVideoStream.getVideoTracks()[0];
      const audioTracks = localStream.current.getAudioTracks();
      
      const newStream = new MediaStream([...audioTracks, newVideoTrack]);
      localStream.current = newStream;
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = newStream;
      }
      
      if (peerConnection.current && isInCall) {
        const senders = peerConnection.current.getSenders();
        const videoSender = senders.find(sender => 
          sender.track?.kind === 'video'
        );
        
        if (videoSender) {
          await videoSender.replaceTrack(newVideoTrack);
        }
      }
    } catch (err) {
      console.error('Error switching camera:', err);
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  };

  const handleStartCall = async () => {
    try {
      console.log("Starting call to:", receiverId);
      setIsCalling(true);
      setCallStatus('connecting');
      
      socket?.emit("initiate-call", { to: receiverId });
      console.log("Call initiation event sent");
      
      localStream.current = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      
      await getVideoDevices();
      
      const activeTrack = localStream.current.getVideoTracks()[0];
      if (activeTrack) {
        const activeDeviceId = activeTrack.getSettings().deviceId;
        const activeIndex = videoDevices.findIndex(device => device.deviceId === activeDeviceId);
        if (activeIndex >= 0) {
          setCurrentVideoDeviceIndex(activeIndex);
        }
      }
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream.current;
      }
      
      initializePeerConnection();
      
      if (peerConnection.current) {
        const offer = await peerConnection.current.createOffer();
        await peerConnection.current.setLocalDescription(offer);
        
        socket?.emit("offer", {
          to: receiverId,
          offer
        });
      }
    } catch (err) {
      setIsCalling(false);
      setCallStatus('idle');
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  };

  const handleOffer = async (offer: RTCSessionDescriptionInit) => {
    try {
      localStream.current = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream.current;
      }
      
      initializePeerConnection();
      
      if (peerConnection.current) {
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(offer));
        await createAnswer();
      }
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  };

  const createAnswer = async () => {
    try {
      if (!peerConnection.current) return;
      
      const answer = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(answer);
      
      socket?.emit("answer", {
        to: receiverId,
        answer
      });
      
      setIsInCall(true);
      setIsReceivingCall(false);
      setCallStatus('connected');
      onCallStarted?.();
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  };

  const handleEndCall = () => {
    socket?.emit("end-call", { to: receiverId });
    
    if (localStream.current) {
      localStream.current.getTracks().forEach(track => track.stop());
      localStream.current = null;
    }

    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    
    setIsInCall(false);
    setIsCalling(false);
    setIsReceivingCall(false);
    onCallEnded?.();
  };

  const toggleMute = () => {
    if (localStream.current) {
      const audioTracks = localStream.current.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStream.current) {
      const videoTracks = localStream.current.getVideoTracks();
      videoTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsVideoEnabled(!isVideoEnabled);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="video-call-container">
      {/* Remote Video (Main) */}
      <div className={`remote-video-container ${!isInCall ? 'hidden' : ''}`}>
        <video 
          ref={remoteVideoRef} 
          autoPlay 
          playsInline
          className="remote-video"
        />
        <div className="remote-name">{receiverName}</div>
      </div>
      
      {/* Local Video (Picture-in-Picture) */}
      <div className={`local-video-container ${!isInCall && !isCalling && !isReceivingCall ? 'centered' : ''}`}>
        <video 
          ref={localVideoRef} 
          autoPlay 
          muted 
          playsInline
          className={`local-video ${!isVideoEnabled ? 'video-disabled' : ''}`}
        />
        {!isVideoEnabled && <div className="video-off-indicator">Camera Off</div>}
        <div className="local-name">{userName}</div>
      </div>
      
      {/* Call Status */}
      <div className="call-status-container">
        {callStatus === 'connecting' && <div className="call-status connecting">Connecting...</div>}
        {callStatus === 'connected' && <div className="call-status connected">Connected • {formatDuration(callDuration)}</div>}
        {callStatus === 'ended' && <div className="call-status ended">Call Ended</div>}
      </div>
      
      {/* Call Controls */}
      <div className="call-controls">
        {!isInCall && !isCalling && !isReceivingCall ? (
          // Idle state - Start call button
          <button 
            className="start-call-button"
            onClick={handleStartCall}
          >
            <span className="icon-phone"></span>
            Call {receiverName}
          </button>
        ) : isCalling ? (
          // Calling state
          <div className="calling-controls">
            <div className="calling-text">Calling {receiverName}...</div>
            <button 
              className="end-call-button"
              onClick={handleEndCall}
            >
              <span className="icon-hangup"></span>
              Cancel
            </button>
          </div>
        ) : isReceivingCall ? (
          // Receiving call state
          <div className="incoming-call-controls">
            <div className="incoming-call-text">Incoming call from {receiverName}</div>
            <div className="incoming-call-buttons">
              <button 
                className="accept-call-button"
                onClick={createAnswer}
              >
                <span className="icon-accept"></span>
                Accept
              </button>
              <button 
                className="reject-call-button"
                onClick={handleEndCall}
              >
                <span className="icon-reject"></span>
                Decline
              </button>
            </div>
          </div>
        ) : (
          // In call controls
          <div className="in-call-controls">
            <button 
              className={`mute-button ${isMuted ? 'active' : ''}`}
              onClick={toggleMute}
            >
              <span className={`icon-${isMuted ? 'muted' : 'mic'}`}></span>
            </button>
            <button 
              className="end-call-button"
              onClick={handleEndCall}
            >
              <span className="icon-hangup"></span>
            </button>
            <button 
              className={`video-button ${!isVideoEnabled ? 'active' : ''}`}
              onClick={toggleVideo}
            >
              <span className={`icon-${isVideoEnabled ? 'video' : 'video-off'}`}></span>
            </button>
            
            {/* Add the camera switch button if multiple cameras are available */}
            {videoDevices.length > 1 && (
              <button 
                className="switch-camera-button"
                onClick={switchCamera}
                title="Switch Camera"
              >
                <span className="icon-switch-camera"></span>
              </button>
            )}
          </div>
        )}
      </div>
      
      {/* Optionally add a camera indicator */}
      {isInCall && videoDevices.length > 1 && (
        <div className="camera-indicator">
          Camera: {videoDevices[currentVideoDeviceIndex]?.label || `Camera ${currentVideoDeviceIndex + 1}`}
        </div>
      )}
    </div>
  );
};