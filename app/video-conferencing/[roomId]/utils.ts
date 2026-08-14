import { io, Socket } from "socket.io-client";
import { Device, types } from "mediasoup-client";
import {Dispatch, RefObject, SetStateAction} from "react";
import {DefaultEventsMap} from "@socket.io/component-emitter";


export async function initialize(
    roomId: string,
    socketRef: RefObject<Socket<DefaultEventsMap, DefaultEventsMap> | null>,
    sendTransportRef: RefObject<types.Transport<types.AppData> | null>,
    recvTransportRef: RefObject<types.Transport<types.AppData> | null>,
    deviceRef: RefObject<Device | null>,
    log: (message: string) => void,
    consumersRef:  RefObject<{ id: string, producerId: string, remoteStream: MediaStream }[]>
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

        //-----------------------------------
        // Create Device
        //-----------------------------------

        const device = new Device();

        deviceRef.current = device;

        log("Device created");

        socket.on('newProducer', async ({ producerId }) => {
            const params = await socket.emitWithAck('clientConsume', {
                producerId,
                rtpCapabilities: device.recvRtpCapabilities,
            });
            const consumer = await recvTransport.consume(params);
            const remoteStream = new MediaStream([consumer.track]);
            consumersRef.current.push({id: consumer.id, producerId: consumer.producerId, remoteStream})
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

        //-----------------------------------
        // Send Transport
        //-----------------------------------
        sendTransport.on(
            "connect",
            async ({ dtlsParameters }, callback, errback) => {
                try {
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
    const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
    });
    const sendTransport = sendTransportRef.current;
    streamRef.current = stream;
    audioTrackRef.current = stream.getAudioTracks()[0];
    videoTrackRef.current = stream.getVideoTracks()[0];
    if (sendTransport){
        log("setting up streamer")
        console.log(sendTransport.connectionState);
        //produce audio
        audioProducerRef.current = await sendTransport.produce({
                track: audioTrackRef.current,
                appData: {
                    mediaTag: "audio"
                }
            });

        log("audio track track fed into producer")

        //produce video
        videoProducerRef.current = await sendTransport.produce({
                track: videoTrackRef.current,
                appData: {
                    mediaTag: "camera"
                }
            });
        log("video track fed into producer")
    }
    else{
        log("Error with initialization process");
    }

}



export async function loadDevices(
    setSelectedMicrophone: Dispatch<SetStateAction<string>>,
    setSelectedCamera: Dispatch<SetStateAction<string>>,
    setCameras: Dispatch<SetStateAction<MediaDeviceInfo[]>>,
    setMicrophones: Dispatch<SetStateAction<MediaDeviceInfo[]>>
) {

    // Ask permission once
    const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
    });

    // Stop the temporary stream
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

    if (cams.length > 0)
        setSelectedCamera(cams[0].deviceId);

    if (mics.length > 0)
        setSelectedMicrophone(mics[0].deviceId);

}