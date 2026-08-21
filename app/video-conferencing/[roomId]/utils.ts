import { io, Socket } from "socket.io-client";
import { Device, types } from "mediasoup-client";
import React, {Dispatch, RefObject, SetStateAction} from "react";
import {DefaultEventsMap} from "@socket.io/component-emitter";
import { error } from "console";
import {Message} from "postcss";


export async function initialize(
    roomId: string,
    socketRef: RefObject<Socket<DefaultEventsMap, DefaultEventsMap> | null>,
    sendTransportRef: RefObject<types.Transport<types.AppData> | null>,
    recvTransportRef: RefObject<types.Transport<types.AppData> | null>,
    deviceRef: RefObject<Device | null>,
    log: (message: string) => void,
    consumersRef:   RefObject<Map<string, { id: string; producerId: string; remoteStreamTrack: MediaStreamTrack; kind: string }[]>>,
    setMessages:  Dispatch<SetStateAction<{
        id: number
        author: string
        content: string
    }[]>>,
    ) {
    try {
        //-----------------------------------
        // Connect socket
        //-----------------------------------
        const socket = io(process.env.NEXT_PUBLIC_NODE_SERVER,  {
            auth: {
                roomId: roomId
            }
        });

        socketRef.current = socket;

        await new Promise<void>((resolve) => {
            socket.on("connect", () => {
                log("Socket connected");
                resolve();
            });
        });

        
        socket.on("socketdisconnected", (disconnectedSocket) => {
            consumersRef.current.delete(disconnectedSocket);
        });

        socket.on("message", (message, author) => {
            setMessages((current) => [
                ...current,
                { id: Date.now(), author, content: message },
            ]);
        })

        //-----------------------------------
        // Create Device
        //-----------------------------------

        const device = new Device();

        deviceRef.current = device;

        log("Device created");

        socket.on('newProducer', async ({ producerId, socketId }) => {
            const params = await socket.emitWithAck('clientConsume', {
                producerId,
                rtpCapabilities: device.recvRtpCapabilities,
            });
            if (params.id && params.producerId){
                console.log("consume params:", params);
                const consumer = await recvTransport.consume(params);
                consumer.resume();
                consumer.on('trackended', () => log('Consumer track ended'));
                consumer.on('transportclose', () => log('Consumer transport closed'));
                log(`Track muted: ${consumer.track.muted}, readyState: ${consumer.track.readyState}`);

                const remoteStreamTrack = consumer.track;
                if (consumersRef.current.get(socketId)) {
                    const index = consumersRef.current.get(socketId)?.findIndex(elt => elt.kind === consumer.kind); // remove existing tracks of the same kind
                    //before adding a new one
                    if (index !== undefined && index !== -1) consumersRef.current.get(socketId)?.splice(index);
                    consumersRef.current.get(socketId)?.push({id: consumer.id, producerId: consumer.producerId, remoteStreamTrack, kind: consumer.kind});
                }
                else {
                    consumersRef.current.set(socketId, [{id: consumer.id, producerId: consumer.producerId, remoteStreamTrack, kind: consumer.kind}]);
                }
                console.log("new remote stream");
                console.log("socket id ", socketId);
                console.log('len remote refs for this socket = ', consumersRef.current.get(socketId)?.length)
            }
            else {
                console.log("could not consume . Invalid parameters ", params)
            }

                    });

        //-----------------------------------
        // Load Router Capabilities
        //-----------------------------------

        const routerRtpCapabilities = await socket.emitWithAck("getRouterRTPCapabilities");

        await device.load({
            routerRtpCapabilities
        });

        log("Device loaded");
        //-----------------------------------
        // Create transports
        //-----------------------------------

        const transportParams = await socket.emitWithAck("requestTransportCreation");

        const sendTransport = device.createSendTransport(transportParams.producingTransportParams);

        const recvTransport = device.createRecvTransport(transportParams.consumingTransportParams);

        sendTransportRef.current = sendTransport;
        recvTransportRef.current = recvTransport;
        log("Transports created");

        sendTransportRef.current.addListener('connectionstatechange', (state)=>log("send transport connection state has changed " + state));
        recvTransportRef.current.addListener('connectionstatechange', (state)=>log("receive transport connection state has changed " + state));
        
        sendTransportRef.current.addListener('icegatheringstatechange', (state)=>log("send transport ICE state has changed " + state));
        recvTransportRef.current.addListener('icegatheringstatechange', (state)=>log("receive transport ICE state has changed " + state));
        
        //-----------------------------------
        // Send Transport
        //-----------------------------------
        sendTransport.on(
            "connect",
            async ({ dtlsParameters }, callback, errback) => {
                try {
                    console.log("connecting transport...")
                    await socket.emitWithAck(
                        "connectSenderTransport",
                        dtlsParameters
                    );
                    console.log(dtlsParameters)
                    callback();
                    log("Send transport connected");

                } catch (err) {
                    errback(err as Error);
                }
            }
        );

        sendTransport.on(
            "produce",
            async (
                { kind, rtpParameters, appData },
                callback,
                errback
            ) => {
                log("produce event fired")
                try {
                    const { id } =
                        await socket.emitWithAck(
                            "transportProduce",
                            {
                                kind,
                                rtpParameters,
                                appData,
                            }
                        );
                    callback({ id });
                    log("Producer created");
                } catch (err) {
                    errback(err as Error);
                }
            }
        );

        //-----------------------------------
        // Receive Transport
        //-----------------------------------
        recvTransport.on(
            "connect",
            async ({ dtlsParameters }, callback, errback) => {
                try {
                    await socket.emitWithAck(
                        "connectRecvTransport",
                        dtlsParameters
                    );
                    callback();
                    log("Receive transport connected");

                } catch (err) {
                    errback(err as Error);
                }
            }
        );
        log("Initialization complete");
        socket.emit("getExistingProducers");
    } catch (err) {
        console.error(err);
        log("Initialization failed");
    }



}



export async function startStreaming(
    streamRef: RefObject<MediaStream | null>,
    audioTrackRef:  RefObject<MediaStreamTrack | null>,
    videoTrackRef: RefObject<MediaStreamTrack | null>,
    audioProducerRef: RefObject<types.Producer<types.AppData> | null>,
    videoProducerRef: RefObject<types.Producer<types.AppData> | null>,
    sendTransportRef:  RefObject<types.Transport<types.AppData> | null>,
    selectedCamera:string,
    selectedMicrophone:string,
    log: (message: string)=>void
){
    try{
        console.log(selectedCamera, selectedMicrophone);
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: {
                    exact: selectedMicrophone
                }
            },
            video: {
                deviceId: {
                    exact: selectedCamera
                }
            }
        });
        const sendTransport = sendTransportRef.current;
        streamRef.current = stream;
        const tracks = stream.getTracks()[0];
        audioTrackRef.current = stream.getAudioTracks()[0];
        videoTrackRef.current = stream.getVideoTracks()[0];
        if (sendTransport){
            log("setting up streamer")
            console.log(sendTransport.connectionState);
            //produce audio
            // audioProducerRef.current = await sendTransport.produce({
            //         track: audioTrackRef.current,
            //         appData: {
            //             mediaTag: "audio"
            //         }
            //     });

            // log("audio track track fed into producer")

            //produce video
            videoProducerRef.current = await sendTransport.produce({
                    track: videoTrackRef.current,
                    appData: {
                        mediaTag: "camera"
                    }
                });
            log("video track fed into producer");
            console.log("2", sendTransport.connectionState);
        }
        else{
            log("Error with initialization process");
        }
    }
    catch(err){
        console.log(err);
        if (err instanceof DOMException) {
            console.log("Name:", err.name);
            console.log("Message:", err.message);
            console.log("Constraint:", (err as any).constraint);
        }
    }
}



export async function loadDevices(
    setSelectedMicrophone: Dispatch<SetStateAction<string>>,
    setSelectedCamera: Dispatch<SetStateAction<string>>,
    setCameras: Dispatch<SetStateAction<MediaDeviceInfo[]>>,
    setMicrophones: Dispatch<SetStateAction<MediaDeviceInfo[]>>,
    selectedCamera: string,
    selectedMicrophone: string
) {

    try{
        // Ask permission once
        const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        // // Stop the temporary stream
        stream.getTracks().forEach(track => track.stop());

        const devices = await navigator.mediaDevices.enumerateDevices();

        const cams = devices.filter(
            d => d.kind === "videoinput"
        );

        const mics = devices.filter(
            d => d.kind === "audioinput"
        );

        setCameras(cams);
        setMicrophones(mics);

        if (cams.length > 0) {
            setSelectedCamera(cams[0].deviceId);
            console.log("camera set to ",cams[0].deviceId)
        }
        else{
            console.log("could not find camera");
        }

        if (mics.length > 0) {
            setSelectedMicrophone(mics[0].deviceId);
            console.log("set mic to ", mics[0].deviceId)
        }
        else{
            console.log("No mike found");
        }
    }
    catch(err){
        console.log(err)
    }

}



export const sendMessage = (
    event: React.FormEvent,
    setMessages:  Dispatch<SetStateAction<{
        id: number
        author: string
        content: string
    }[]>>,
    setMessage: Dispatch<SetStateAction<string>>,
    message: string,
    socketRef: RefObject<Socket<DefaultEventsMap, DefaultEventsMap> | null>
    ) => {
    event.preventDefault();

    const content = message.trim();
    if (!content) return;

    socketRef.current?.emit("message", content);
    setMessages((current) => [
        ...current,
        { id: Date.now(), author: "Vous", content },
    ]);
    setMessage("");
};