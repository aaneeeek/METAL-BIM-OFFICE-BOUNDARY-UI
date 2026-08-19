"use client";

import { useEffect, useRef, useState } from "react";
import { Socket } from "socket.io-client";
import { Device, types } from "mediasoup-client";
import { useParams } from "next/navigation";
import {initialize, loadDevices, startStreaming} from "@/app/video-conferencing/[roomId]/utils";

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

    const log = (message: string) => {
        console.log(message);
        setLogs(prev => [...prev, message]);
    };

    useEffect(() => {
        (async()=>{
            await initialize(params.roomId as string, socketRef, sendTransportRef, recvTransportRef, deviceRef, log, consumersRef);
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
    }, [selectedCamera, selectedMicrophone])

    return (
        <>
            <h2>CALL</h2>

            {logs.map((logMessage, index) => (
                <p key={index}>{logMessage}</p>
            ))}

            <div>

                <label>Camera</label>

                <select
                    value={selectedCamera}
                    onChange={(e) =>
                        setSelectedCamera(e.target.value)
                    }
                >

                    {cameras.map(camera => (

                        <option
                            key={camera.deviceId}
                            value={camera.deviceId}
                        >
                            {camera.label}
                        </option>

                    ))}

                </select>

            </div>

            <div>

                <label>Microphone</label>

                <select
                    value={selectedMicrophone}
                    onChange={(e) =>
                        setSelectedMicrophone(e.target.value)
                    }
                >
                    {microphones.map(mic => (
                        <option
                            key={mic.deviceId}
                            value={mic.deviceId}
                        >
                            {mic.label}
                        </option>

                    ))}

                </select>

            </div>
            <section>
                {Array.from(consumersRef.current.entries()).map(([key, value]) => {
                    let mediaStream = new MediaStream();
                    value.forEach((elt) => mediaStream.addTrack(elt.remoteStreamTrack));
                    return (
                        <div className="bg-blue h-[330px] w-[330px]" key={key}>
                            {<video
                                ref={(el) => {
                                    if (el) {
                                        el.srcObject = mediaStream;
                                    }
                                }}
                                autoPlay
                                playsInline
                                controls={true}
                            />}
                        </div>
                    )
                })}
            </section>
        </>
    );
}