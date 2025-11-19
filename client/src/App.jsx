import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import SimplePeer from 'simple-peer';
import { Mic, MicOff, SkipForward, Phone, Loader2 } from 'lucide-react';

// Initialize socket connection
// In production, we use the environment variable. In dev, we fallback to localhost.
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';
const socket = io(SERVER_URL);

function App() {
    const [gameState, setGameState] = useState('home'); // 'home', 'searching', 'connected'
    const [isMuted, setIsMuted] = useState(false);
    const [partnerId, setPartnerId] = useState(null);

    const localStreamRef = useRef(null);
    const peerRef = useRef(null);
    const audioRef = useRef(null); // For remote audio

    useEffect(() => {
        // Socket event listeners
        socket.on('partner_found', handlePartnerFound);
        socket.on('signal', handleSignal);
        socket.on('connect', () => console.log('Connected to server'));

        return () => {
            socket.off('partner_found', handlePartnerFound);
            socket.off('signal', handleSignal);
            socket.off('connect');
        };
    }, []);

    const startCall = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            localStreamRef.current = stream;
            setGameState('searching');
            socket.emit('find_partner');
        } catch (err) {
            console.error("Error accessing microphone:", err);
            alert("Microphone access is required to use this app.");
        }
    };

    const handlePartnerFound = ({ partnerId, initiator }) => {
        console.log('Partner found:', partnerId, 'Initiator:', initiator);
        setPartnerId(partnerId);
        setGameState('connected');

        const peer = new SimplePeer({
            initiator: initiator,
            trickle: false,
            stream: localStreamRef.current,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:global.stun.twilio.com:3478' }
                ]
            }
        });

        peer.on('signal', (data) => {
            socket.emit('signal', { to: partnerId, signal: data });
        });

        peer.on('stream', (remoteStream) => {
            if (audioRef.current) {
                audioRef.current.srcObject = remoteStream;
            }
        });

        peer.on('close', () => {
            handlePeerDisconnect();
        });

        peer.on('error', (err) => {
            console.error('Peer error:', err);
            handlePeerDisconnect();
        });

        peerRef.current = peer;
    };

    const handleSignal = ({ from, signal }) => {
        if (peerRef.current) {
            peerRef.current.signal(signal);
        }
    };

    const handlePeerDisconnect = () => {
        if (peerRef.current) {
            peerRef.current.destroy();
            peerRef.current = null;
        }
        // If we were connected, go back to searching or home?
        // Requirement says "Skip" logic emits find_partner again.
        // If partner disconnects, we probably want to find a new one automatically or go to home.
        // Let's go to searching to find a new one automatically for a fluid experience, 
        // or back to home if we want to be safe. Let's go to searching.

        // However, if *we* clicked skip, we handle that in handleSkip.
        // This is for when the *other* person disconnects or error.

        // Check if we are still in 'connected' state to avoid loops if we already skipped
        setGameState((prev) => {
            if (prev === 'connected') {
                // Auto-search again
                socket.emit('find_partner');
                return 'searching';
            }
            return prev;
        });
    };

    const handleSkip = () => {
        if (peerRef.current) {
            peerRef.current.destroy();
            peerRef.current = null;
        }
        setGameState('searching');
        socket.emit('find_partner');
    };

    const toggleMute = () => {
        if (localStreamRef.current) {
            const audioTrack = localStreamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsMuted(!audioTrack.enabled);
            }
        }
    };

    const endCall = () => {
        if (peerRef.current) {
            peerRef.current.destroy();
            peerRef.current = null;
        }
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
        }
        // Disconnect socket to remove from queue if needed, or just emit a leave event
        // For now, just reloading page or resetting state is enough.
        // We need to tell server we are done if we were in queue.
        // But socket.emit('disconnect') is reserved. 
        // We can just reload window for full cleanup or reset state.
        window.location.reload();
    };

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4 font-sans">
            {/* Hidden Audio Element for Remote Stream */}
            <audio ref={audioRef} autoPlay />

            <div className="w-full max-w-md bg-surface rounded-3xl shadow-2xl overflow-hidden border border-slate-700">

                {/* Header */}
                <div className="p-6 bg-slate-900/50 border-b border-slate-700 flex justify-between items-center">
                    <h1 className="text-xl font-bold text-white tracking-wide">AirTalk<span className="text-primary">.clone</span></h1>
                    <div className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
                </div>

                {/* Main Content */}
                <div className="p-8 flex flex-col items-center justify-center min-h-[400px]">

                    {gameState === 'home' && (
                        <div className="text-center space-y-8 animate-in fade-in zoom-in duration-300">
                            <div className="relative">
                                <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full"></div>
                                <div className="w-32 h-32 bg-slate-700 rounded-full flex items-center justify-center mx-auto relative z-10 border-4 border-slate-600">
                                    <Phone className="w-12 h-12 text-slate-400" />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <h2 className="text-2xl font-bold text-white">Ready to talk?</h2>
                                <p className="text-slate-400">Connect with random people worldwide.</p>
                            </div>

                            <button
                                onClick={startCall}
                                className="w-full py-4 px-6 bg-primary hover:bg-blue-600 active:scale-95 transition-all rounded-xl text-white font-bold text-lg shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
                            >
                                <Phone className="w-5 h-5" />
                                Start Call
                            </button>
                        </div>
                    )}

                    {gameState === 'searching' && (
                        <div className="text-center space-y-8 animate-in fade-in duration-300">
                            <div className="relative">
                                <div className="absolute inset-0 bg-accent/20 blur-3xl rounded-full"></div>
                                <div className="w-32 h-32 bg-slate-700 rounded-full flex items-center justify-center mx-auto relative z-10 border-4 border-accent/50 animate-pulse">
                                    <Loader2 className="w-12 h-12 text-accent animate-spin" />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <h2 className="text-2xl font-bold text-white">Searching...</h2>
                                <p className="text-slate-400">Finding a partner for you.</p>
                            </div>

                            <button
                                onClick={endCall}
                                className="px-6 py-2 text-slate-400 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    )}

                    {gameState === 'connected' && (
                        <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

                            {/* Avatar Area */}
                            <div className="relative py-4">
                                <div className="absolute inset-0 bg-green-500/10 blur-3xl rounded-full"></div>
                                <div className="w-40 h-40 bg-gradient-to-br from-slate-700 to-slate-800 rounded-full flex items-center justify-center mx-auto relative z-10 border-4 border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.3)]">
                                    <span className="text-4xl">👻</span>
                                </div>
                                <div className="absolute bottom-4 right-1/2 translate-x-14 w-4 h-4 bg-green-500 border-2 border-surface rounded-full"></div>
                            </div>

                            <div className="text-center">
                                <h2 className="text-2xl font-bold text-white">Connected</h2>
                                <p className="text-green-400 text-sm font-medium tracking-wider uppercase">Live Audio</p>
                            </div>

                            {/* Controls */}
                            <div className="grid grid-cols-2 gap-4 mt-8">
                                <button
                                    onClick={toggleMute}
                                    className={`p-4 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all ${isMuted ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-slate-700 hover:bg-slate-600 text-white'}`}
                                >
                                    {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                                    <span className="text-xs font-bold uppercase">{isMuted ? 'Unmute' : 'Mute'}</span>
                                </button>

                                <button
                                    onClick={handleSkip}
                                    className="p-4 rounded-2xl bg-slate-700 hover:bg-slate-600 text-white flex flex-col items-center justify-center gap-2 transition-all active:scale-95"
                                >
                                    <SkipForward className="w-6 h-6" />
                                    <span className="text-xs font-bold uppercase">Next</span>
                                </button>
                            </div>

                            <button
                                onClick={endCall}
                                className="w-full py-3 text-slate-500 hover:text-red-400 transition-colors text-sm"
                            >
                                Stop Call
                            </button>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}

export default App;
