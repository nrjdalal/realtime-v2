"use client"

import { useEffect, useRef, useState } from "react"

import { Mic, MicOff, Play, Square, Video, VideoOff } from "lucide-react"
import { Device, types } from "mediasoup-client"
import { io, Socket } from "socket.io-client"

import { cn } from "@/lib/utils"
import { useWindowSize } from "@/hooks/use-window-size"
import { Toggle } from "@/components/ui/toggle"
import { StreamTimer } from "@/components/stream-timer"

export default function Page() {
  const { resize } = useWindowSize()

  const [micToggle, setMicToggle] = useState(false)
  const [videoToggle, setVideoToggle] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)

  const animationRef = useRef<number | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const fallbackVideoTrackRef = useRef<MediaStreamTrack | null>(null)
  const fallbackAudioTrackRef = useRef<MediaStreamTrack | null>(null)
  const combinedStreamRef = useRef<MediaStream | null>(null)
  const socketRef = useRef<Socket | null>(null)
  const deviceRef = useRef<types.Device | null>(null)
  const transportRef = useRef<types.Transport | null>(null)
  const producersRef = useRef<types.Producer[]>([])

  const addFallbackTrack = () => {
    const canvas = document.createElement("canvas")
    canvas.width = 1280
    canvas.height = 720
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const fallbackStream = canvas.captureStream(30)
    const fallbackTrack = fallbackStream.getVideoTracks()[0]
    fallbackVideoTrackRef.current = fallbackTrack
    combinedStreamRef.current?.addTrack(fallbackTrack)

    let start = Date.now()

    const draw = () => {
      const now = Date.now()
      const elapsed = Math.floor((now - start) / 1000)

      ctx.fillStyle = "black"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      ctx.fillStyle = "black"
      ctx.font = "24px sans-serif"
      ctx.textAlign = "center"
      ctx.fillText("STREAM", canvas.width / 2, canvas.height / 2)
      ctx.fillText(`Time: ${elapsed}s`, canvas.width / 2, canvas.height / 2 + 40)

      animationRef.current = requestAnimationFrame(draw)
    }

    draw()
  }

  const removeFallbackTrack = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }

    const track = fallbackVideoTrackRef.current
    if (track && combinedStreamRef.current?.getVideoTracks().includes(track)) {
      combinedStreamRef.current.removeTrack(track)
      track.stop()
    }
    fallbackVideoTrackRef.current = null
  }

  const addFallbackAudioTrack = () => {
    const audioCtx = new AudioContext()
    const oscillator = audioCtx.createOscillator()
    const gain = audioCtx.createGain()

    oscillator.type = "sine"
    oscillator.frequency.setValueAtTime(0, audioCtx.currentTime)
    gain.gain.setValueAtTime(0, audioCtx.currentTime)

    oscillator.connect(gain)

    const dest = audioCtx.createMediaStreamDestination()
    gain.connect(dest)

    oscillator.start()

    const track = dest.stream.getAudioTracks()[0]
    fallbackAudioTrackRef.current = track
    audioCtxRef.current = audioCtx
    combinedStreamRef.current?.addTrack(track)
  }

  const removeFallbackAudioTrack = () => {
    if (audioCtxRef.current) {
      audioCtxRef.current.close()
      audioCtxRef.current = null
    }

    const track = fallbackAudioTrackRef.current
    if (track && combinedStreamRef.current?.getAudioTracks().includes(track)) {
      combinedStreamRef.current.removeTrack(track)
      track.stop()
    }
    fallbackAudioTrackRef.current = null
  }

  useEffect(() => {
    if (typeof window === "undefined") return

    const stream = new MediaStream()
    combinedStreamRef.current = stream

    addFallbackTrack()
    addFallbackAudioTrack()

    if (videoRef.current) {
      videoRef.current.srcObject = stream
    }

    return () => {
      removeFallbackTrack()
      removeFallbackAudioTrack()
    }
  }, [])

  const stopAllProducers = () => {
    producersRef.current.forEach((p) => {
      p.close()
      socketRef.current?.emit("producerClosed", { producerId: p.id })
    })
    producersRef.current = []
  }

  useEffect(() => {
    if (isStreaming) {
      const socket = io("http://localhost:4443")
      socketRef.current = socket

      socket.on("connect", () => {
        console.log("Socket connected", socket.id)
      })

      socket.emit(
        "getRouterRtpCapabilities",
        null,
        async (rtpCapabilities: types.RtpCapabilities) => {
          const device = new Device()
          await device.load({ routerRtpCapabilities: rtpCapabilities })
          deviceRef.current = device

          socket.emit(
            "createWebRtcTransport",
            null,
            async (transportOptions: types.TransportOptions) => {
              const transport = device.createSendTransport(transportOptions)
              transportRef.current = transport

              transport.on("connect", ({ dtlsParameters }, callback) => {
                socket.emit(
                  "connectTransport",
                  { transportId: transport.id, dtlsParameters },
                  ({ ok }: { ok: boolean }) => {
                    if (ok) callback()
                    else console.error("Something went wrong!")
                  },
                )
              })

              transport.on("produce", async ({ kind, rtpParameters }, callback) => {
                socket.emit(
                  "produce",
                  {
                    transportId: transport.id,
                    kind,
                    rtpParameters,
                  },
                  ({ id }: { id: string }) => {
                    callback({ id })
                  },
                )
              })

              const stream = combinedStreamRef.current!
              for (const track of stream.getTracks()) {
                const producer = await transport.produce({ track })
                producersRef.current.push(producer)
              }
            },
          )
        },
      )
    } else {
      stopAllProducers()
      transportRef.current?.close()
      transportRef.current = null
      socketRef.current?.disconnect()
      socketRef.current = null
    }

    return () => {
      stopAllProducers()
      transportRef.current?.close()
      socketRef.current?.disconnect()
    }
  }, [isStreaming])

  return (
    <main className="flex h-screen w-screen items-center justify-center bg-white p-3">
      <div
        className={cn(
          "relative aspect-video overflow-hidden rounded-lg",
          resize ? "h-full" : "w-full",
          "bg-black",
        )}
      >
        <StreamTimer isActive={isStreaming} />

        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        />

        <div className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2">
          <div className="*:[&[data-state=off]]:!bg-border flex items-center gap-3 *:size-12 *:cursor-pointer *:border-2 [&_svg]:!size-5 [&_svg]:text-white">
            {/* Audio Toggle */}
            <Toggle
              aria-label="Audio"
              pressed={micToggle}
              onPressedChange={async (enabled) => {
                const stream = combinedStreamRef.current!
                const audioProducer = producersRef.current.find((p) => p.kind === "audio")

                stream.getAudioTracks().forEach((t) => {
                  stream.removeTrack(t)
                  t.stop()
                })

                if (enabled) {
                  try {
                    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
                    const micTrack = micStream.getAudioTracks()[0]
                    removeFallbackAudioTrack()
                    stream.addTrack(micTrack)
                    setMicToggle(true)

                    if (audioProducer) {
                      await audioProducer.replaceTrack({ track: micTrack })
                    }
                  } catch (err) {
                    console.warn("Mic error", err)
                    setMicToggle(false)
                  }
                } else {
                  addFallbackAudioTrack()
                  setMicToggle(false)

                  if (fallbackAudioTrackRef.current && audioProducer) {
                    await audioProducer.replaceTrack({ track: fallbackAudioTrackRef.current })
                  }
                }
              }}
            >
              {micToggle ? <Mic className="!text-green-500" /> : <MicOff />}
            </Toggle>

            {/* Video Toggle */}
            <Toggle
              aria-label="Video"
              pressed={videoToggle}
              onPressedChange={async (enabled) => {
                const stream = combinedStreamRef.current!
                const videoProducer = producersRef.current.find((p) => p.kind === "video")

                stream.getVideoTracks().forEach((t) => {
                  stream.removeTrack(t)
                  t.stop()
                })

                if (enabled) {
                  try {
                    const camStream = await navigator.mediaDevices.getUserMedia({ video: true })
                    const camTrack = camStream.getVideoTracks()[0]
                    removeFallbackTrack()
                    stream.addTrack(camTrack)
                    setVideoToggle(true)

                    if (videoProducer) {
                      await videoProducer.replaceTrack({ track: camTrack })
                    }
                  } catch (err) {
                    console.warn("Video error", err)
                    setVideoToggle(false)
                  }
                } else {
                  addFallbackTrack()
                  setVideoToggle(false)

                  if (fallbackVideoTrackRef.current && videoProducer) {
                    await videoProducer.replaceTrack({ track: fallbackVideoTrackRef.current })
                  }
                }
              }}
            >
              {videoToggle ? <Video className="!text-green-500" /> : <VideoOff />}
            </Toggle>

            {/* Stream Toggle */}
            <Toggle
              className="ml-3"
              aria-label="Play"
              pressed={isStreaming}
              onPressedChange={() => {
                const next = !isStreaming
                setIsStreaming(next)
              }}
            >
              {isStreaming ? <Square className="!text-red-500" /> : <Play />}
            </Toggle>
          </div>
        </div>
      </div>
    </main>
  )
}
