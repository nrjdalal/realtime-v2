"use client"

import { useEffect, useRef, useState } from "react"

import Hls from "hls.js"
import { Loader2 } from "lucide-react"

export default function WatchPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [streamAvailable, setStreamAvailable] = useState(false)

  const streamUrl = `http://localhost:4443/hls/stream.m3u8`

  // Poll for stream availability
  useEffect(() => {
    if (streamAvailable) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(streamUrl, { method: "HEAD" })
        if (res.ok) {
          setStreamAvailable(true)
        }
      } catch {
        // ignore network errors
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [streamAvailable, streamUrl])

  // Initialize HLS when stream is available
  useEffect(() => {
    if (!streamAvailable) return
    const video = videoRef.current
    if (!video) return

    if (Hls.isSupported()) {
      const hls = new Hls()
      hls.loadSource(streamUrl)
      hls.attachMedia(video)
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          hls.destroy()
          setStreamAvailable(false)
        }
      })
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = streamUrl
      video.addEventListener("loadedmetadata", () => video.play())
    }
  }, [streamAvailable, streamUrl])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-black p-4 text-white">
      {!streamAvailable ? (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-black">
          <Loader2 className="h-16 w-16 animate-spin text-white" />
          <p className="mt-4 text-white">Waiting for live stream...</p>
        </div>
      ) : (
        <video ref={videoRef} controls autoPlay className="w-full max-w-4xl rounded shadow-lg" />
      )}
    </main>
  )
}
