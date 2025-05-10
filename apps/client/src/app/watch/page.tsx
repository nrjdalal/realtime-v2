"use client"

import { useEffect, useRef, useState } from "react"

import Hls from "hls.js"

export default function WatchPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const streamUrl = `http://localhost:4443/hls/stream.m3u8`

    if (Hls.isSupported()) {
      const hls = new Hls()
      hls.loadSource(streamUrl)
      hls.attachMedia(video)
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          setError("No video stream available.")
        }
      })
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = streamUrl
      video.addEventListener("loadedmetadata", () => video.play())
    } else {
      setError("Your browser does not support HLS playback.")
    }
  }, [])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-black p-4 text-white">
      <h1 className="mb-4 text-2xl">Live Stream</h1>
      {error ? (
        <p className="text-red-500">{error}</p>
      ) : (
        <video ref={videoRef} controls autoPlay className="w-full max-w-4xl rounded shadow-lg" />
      )}
    </main>
  )
}
