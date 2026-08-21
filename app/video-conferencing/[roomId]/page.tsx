"use client";

import { useEffect, useRef, useState } from "react";
import { Socket } from "socket.io-client";
import { Device, types } from "mediasoup-client";
import { useParams } from "next/navigation";
import {initialize, loadDevices, startStreaming, sendMessage} from "@/app/video-conferencing/[roomId]/utils";

export default function Call() {
    const params = useParams();
    const socketRef = useRef<Socket | null>(null);
    const deviceRef = useRef<Device | null>(null);
    const sendTransportRef = useRef<types.Transport | null>(null);
    const recvTransportRef = useRef<types.Transport | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const streamRef = useRef<MediaStream | null>(null);
    const audioTrackRef = useRef<MediaStreamTrack | null>(null);
    const videoTrackRef = useRef<MediaStreamTrack | null>(null);
    const audioProducerRef = useRef<types.Producer | null>(null);
    const videoProducerRef = useRef<types.Producer | null>(null);
    const consumersRef = useRef<Map<string, {id: string, producerId: string, remoteStreamTrack: MediaStreamTrack, kind: string}[]>>(new Map());
    const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
    const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
    const [selectedCamera, setSelectedCamera] = useState("");
    const [selectedMicrophone, setSelectedMicrophone] = useState("");
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(true);
    const [isMicMuted, setIsMicMuted] = useState(false);
    const [isCameraOff, setIsCameraOff] = useState(false);
    const [message, setMessage] = useState("");
    const [messages, setMessages] = useState<
        { id: number; author: string; content: string }[]
    >([]);

    const localVideoRef = useRef<HTMLVideoElement | null>(null);

    const toggleMicrophone = () => {
        const track = audioTrackRef.current;
        if (!track) return;

        track.enabled = !track.enabled;
        setIsMicMuted(!track.enabled);
    };

    const toggleCamera = () => {
        const track = videoTrackRef.current;
        if (!track) return;

        track.enabled = !track.enabled;
        setIsCameraOff(!track.enabled);
    };

    const log = (message: string) => {
        console.log(message);
        setLogs(prev => [...prev, message]);
    };

    useEffect(() => {
        (async()=>{
            await initialize(params.roomId as string, socketRef, sendTransportRef, recvTransportRef, deviceRef, log, consumersRef, setMessages);
            await loadDevices(setSelectedMicrophone, setSelectedCamera, setCameras, setMicrophones, selectedCamera, selectedMicrophone);
            
        })()
        return () => {
            sendTransportRef.current?.close();
            recvTransportRef.current?.close();
            socketRef.current?.disconnect();
            audioProducerRef.current?.close();
            videoProducerRef.current?.close();
            audioTrackRef.current?.stop();
            videoTrackRef.current?.stop();
            streamRef.current?.getTracks().forEach(track => track.stop());
        };
    }, [params.roomId]);

    useEffect(()=>{
        (async()=>{
            if (selectedCamera && selectedMicrophone) await startStreaming(streamRef, audioTrackRef, videoTrackRef, audioProducerRef, videoProducerRef,sendTransportRef, selectedCamera, selectedMicrophone, log);
        })()
    }, [selectedCamera, selectedMicrophone]);

    useEffect(() => {
        (async()=>{
            if (videoTrackRef.current && localVideoRef.current) {
                localVideoRef.current.srcObject = new MediaStream([videoTrackRef.current]);
                await localVideoRef.current.play()
            }
        })()

    }, [videoTrackRef, localVideoRef]);

    return (
        <main className="min-h-screen bg-slate-950 p-3 text-white sm:p-5">
            <section className="mx-auto flex flex-col lg:flex-row min-h-[calc(100vh-24px)] max-w-7xl gap-4">
                {/* Call area */}
                <div className="flex min-w-0 flex-1 flex-col rounded-2xl border border-white/10 bg-slate-900">
                    <header className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-5">
                        <div>
                            <p className="text-xs font-medium uppercase tracking-widest text-emerald-400">
                                Réunion en cours
                            </p>
                            <h1 className="text-lg font-semibold">Salle {params.roomId}</h1>
                        </div>

                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setIsMenuOpen((open) => !open)}
                                className="rounded-lg border border-white/15 bg-white/5 p-2.5 transition hover:bg-white/10"
                                aria-label="Ouvrir les paramètres"
                            >
                                ☰
                            </button>

                            {isMenuOpen && (
                                <div className="absolute right-0 top-12 z-20 w-72 rounded-xl border border-white/10 bg-slate-800 p-3 shadow-2xl">
                                    <label className="mb-2 block text-xs font-medium text-slate-300">
                                        Caméra
                                    </label>
                                    <select
                                        value={selectedCamera}
                                        onChange={(event) => setSelectedCamera(event.target.value)}
                                        className="mb-4 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                                    >
                                        {cameras.map((camera) => (
                                            <option key={camera.deviceId} value={camera.deviceId}>
                                                {camera.label || "Caméra"}
                                            </option>
                                        ))}
                                    </select>

                                    <label className="mb-2 block text-xs font-medium text-slate-300">
                                        Microphone
                                    </label>
                                    <select
                                        value={selectedMicrophone}
                                        onChange={(event) => setSelectedMicrophone(event.target.value)}
                                        className="mb-4 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                                    >
                                        {microphones.map((microphone) => (
                                            <option key={microphone.deviceId} value={microphone.deviceId}>
                                                {microphone.label || "Microphone"}
                                            </option>
                                        ))}
                                    </select>

                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={toggleMicrophone}
                                            className={`rounded-lg px-3 py-2 text-sm font-medium`}
                                            style={{
                                                color: isMicMuted? "white":"black",
                                                backgroundColor: isMicMuted?"#fb2c36":"rgba(255, 255, 255, 0.1)"
                                            }}
                                        >
                                            {isMicMuted ? "Activer le micro" : "Couper le micro"}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={toggleCamera}
                                            className={`rounded-lg px-3 py-2 text-sm font-medium`}
                                            style={{
                                                color: isCameraOff? "white":"black",
                                                backgroundColor: isCameraOff?"#fb2c36":"rgba(255, 255, 255, 0.1)"
                                            }}
                                        >
                                            {isCameraOff ? "Activer caméra" : "Couper caméra"}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </header>

                    {/* Responsive video grid */}
                    <section className="grid flex-1 auto-rows-fr grid-cols-1 gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
                        {/* Local video */}
                        <article className="relative min-h-[220px] overflow-hidden rounded-xl bg-slate-800">
                            <video
                                ref={localVideoRef}
                                autoPlay
                                muted
                                playsInline
                                className={`h-full w-full object-cover`}
                                style={{
                                    display: isCameraOff?'none':'block'
                            }}
                            />

                            {isCameraOff && (
                                <div className="flex h-full min-h-[220px] items-center justify-center text-slate-400">
                                    Caméra désactivée
                                </div>
                            )}

                            <span className="absolute bottom-3 left-3 rounded-md bg-black/60 px-2 py-1 text-xs font-medium">
              Vous {isMicMuted ? "· Micro coupé" : ""}
            </span>
                        </article>

                        {/* Remote videos */}
                        {Array.from(consumersRef.current.entries()).map(([participantId, tracks]) => {
                            const mediaStream = new MediaStream();

                            tracks.forEach((track) => {
                                mediaStream.addTrack(track.remoteStreamTrack);
                            });

                            return (
                                <article
                                    key={participantId}
                                    className="relative min-h-[220px] overflow-hidden rounded-xl bg-slate-800"
                                >
                                    <video
                                        ref={(element) => {
                                            if (element) element.srcObject = mediaStream;
                                        }}
                                        autoPlay
                                        playsInline
                                        className="h-full w-full object-cover"
                                    />

                                    <span className="absolute bottom-3 left-3 rounded-md bg-black/60 px-2 py-1 text-xs font-medium">
                  {participantId}
                </span>
                                </article>
                            );
                        })}
                    </section>
                </div>

                {/* Collapsible chat */}
                <aside
                    className={`
                    flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900 transition-all duration-300
                    w-full 
                    ${isChatOpen ? 'h-80 lg:h-auto' : 'h-14 lg:h-auto'}
                    ${isChatOpen ? 'lg:w-80' : 'lg:w-14'}
                `}
                >
                    <div className="flex items-center justify-between border-b border-white/10 p-3">
                        {isChatOpen && <h2 className="font-semibold">Messages</h2>}

                        <button
                            type="button"
                            onClick={() => setIsChatOpen((open) => !open)}
                            className="rounded-lg p-2 text-slate-300 hover:bg-white/10"
                            aria-label="Réduire ou ouvrir le chat"
                        >
                            {isChatOpen ? "›" : "‹"}
                        </button>
                    </div>

                    {isChatOpen && (
                        <>
                            <div className="flex-1 space-y-3 overflow-y-auto p-3">
                                {messages.length === 0 ? (
                                    <p className="text-sm text-slate-400">
                                        Aucun message pour le moment.
                                    </p>
                                ) : (
                                    messages.map((item) => (
                                        <div key={item.id} className="rounded-lg bg-white/5 p-3">
                                            <p className="mb-1 text-xs font-semibold text-emerald-400">
                                                {item.author}
                                            </p>
                                            <p className="text-sm text-slate-200">{item.content}</p>
                                        </div>
                                    ))
                                )}
                            </div>

                            <form
                                onSubmit={(event)=>sendMessage(event, setMessages, setMessage, message, socketRef)}
                                className="flex gap-2 border-t border-white/10 p-3"
                            >
                                <input
                                    value={message}
                                    onChange={(event) => setMessage(event.target.value)}
                                    placeholder="Écrire un message..."
                                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm outline-none placeholder:text-slate-500 focus:border-emerald-400"
                                />
                                <button
                                    type="submit"
                                    className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold hover:bg-emerald-500"
                                >
                                    Envoyer
                                </button>
                            </form>
                        </>
                    )}
                </aside>
            </section>
        </main>
    );
}