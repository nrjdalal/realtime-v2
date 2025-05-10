import { ChildProcessWithoutNullStreams, spawn } from "node:child_process"
import { createSocket } from "node:dgram"
import fs from "node:fs"
import http from "node:http"
import path from "node:path"

import cors from "cors"
import express from "express"
import { Router, Transport } from "mediasoup/types"
import { Server } from "socket.io"

import config from "@/config"
import { createWorker } from "@/mediasoup"

const importUrl = new URL(import.meta.url).pathname
const hlsDir = path.join(path.dirname(importUrl), "public", "hls")

const app = express()
const server = http.createServer(app)
const io = new Server(server, {
  cors: { origin: "*" },
})

app.use(cors({ origin: "*" }))
app.use("/hls", express.static(hlsDir))

app.get("/", (_, res) => {
  res.json({ message: "Streaming server is up!" })
})

let router: Router

const transportMap = new Map<string, Transport>()

const producersMap = new Map<
  string,
  {
    transport: Transport
    plainTransports: Record<string, Transport>
    consumers: Record<
      string,
      {
        consumer: Awaited<ReturnType<Transport["consume"]>>
        port: number
        payloadType: number
        clockRate: number
        mimeType: string
      }
    >
    ffmpeg?: ChildProcessWithoutNullStreams
  }
>()

io.on("connection", async (socket) => {
  console.log("Client connected", socket.id)

  if (fs.existsSync(hlsDir)) {
    fs.rmSync(hlsDir, { recursive: true, force: true })
  }

  socket.on("getRouterRtpCapabilities", (_, callback) => {
    callback(router.rtpCapabilities)
  })

  socket.on("createWebRtcTransport", async (_, callback) => {
    const transport = await router.createWebRtcTransport({
      listenIps: config.mediasoup.webRtcTransport.listenInfos,
      enableTcp: true,
      enableUdp: true,
      preferUdp: true,
    })
    transportMap.set(transport.id, transport)
    callback({
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    })
  })

  socket.on("connectTransport", async ({ transportId, dtlsParameters }, callback) => {
    const transport = transportMap.get(transportId)
    if (!transport) return callback({ ok: false })
    await transport.connect({ dtlsParameters })
    callback({ ok: true })
  })

  socket.on("produce", async ({ transportId, kind, rtpParameters }, callback) => {
    const transport = transportMap.get(transportId)!
    const producer = await transport.produce({
      kind,
      rtpParameters,
      appData: { from: socket.id },
    })

    let entry = producersMap.get(socket.id)
    if (!entry) {
      entry = {
        transport,
        ffmpeg: undefined,
        plainTransports: {},
        consumers: {},
      }
      producersMap.set(socket.id, entry)
    }

    const tempSocket = createSocket("udp4")
    await new Promise<void>((res) => tempSocket.bind(0, res))
    const { port } = tempSocket.address()
    tempSocket.close()

    const plainTransport = await router.createPlainTransport({
      listenIp: { ip: "127.0.0.1" },
      rtcpMux: true,
    })

    await plainTransport.connect({
      ip: "127.0.0.1",
      port,
    })

    const consumer = await plainTransport.consume({
      producerId: producer.id,
      rtpCapabilities: router.rtpCapabilities,
      paused: false,
    })

    const codec = consumer.rtpParameters.codecs[0]
    const payloadType = codec.payloadType
    const clockRate = codec.clockRate
    const mimeType = codec.mimeType.split("/")[1]

    entry.consumers[kind] = {
      consumer,
      port,
      payloadType,
      clockRate,
      mimeType,
    }
    entry.plainTransports[kind] = plainTransport

    transportMap.set(plainTransport.id, plainTransport)

    const audio = entry.consumers["audio"]
    const video = entry.consumers["video"]

    if (audio && video && !entry.ffmpeg) {
      const sdp = `v=0
o=- 0 0 IN IP4 127.0.0.1
s=MediaSoupCombined
c=IN IP4 127.0.0.1
t=0 0
m=audio ${audio.port} RTP/AVP ${audio.payloadType}
a=rtpmap:${audio.payloadType} ${audio.mimeType}/${audio.clockRate}
a=recvonly
m=video ${video.port} RTP/AVP ${video.payloadType}
a=rtpmap:${video.payloadType} ${video.mimeType}/${video.clockRate}
a=recvonly
`

      if (!fs.existsSync(hlsDir)) fs.mkdirSync(hlsDir, { recursive: true })

      const sdpPath = path.join(hlsDir, `combined.sdp`)
      fs.writeFileSync(sdpPath, sdp)

      const outputM3u8 = path.join(hlsDir, `stream.m3u8`)

      const args = [
        "-protocol_whitelist",
        "file,udp,rtp",
        "-i",
        sdpPath,
        "-fflags",
        "nobuffer",
        "-flags",
        "low_delay",
        "-c:v",
        "libx264",
        "-r",
        "30",
        "-c:a",
        "aac",
        "-ar",
        "48000",
        "-b:a",
        "128k",
        "-f",
        "hls",
        "-hls_time",
        "4",
        "-hls_list_size",
        "10",
        "-hls_flags",
        "delete_segments+append_list",
        "-hls_segment_filename",
        path.join(hlsDir, `segment%03d.ts`),
        outputM3u8,
      ]

      const ffmpeg = spawn("ffmpeg", args)
      ffmpeg.stderr.on("data", (d) => console.log(`FFmpeg: ${d}`))
      ffmpeg.on("exit", (code, sig) => console.log(`FFmpeg exited code=${code} signal=${sig}`))

      entry.ffmpeg = ffmpeg
    }

    callback({ id: producer.id })
  })

  socket.on("producerClosed", () => {
    const entry = producersMap.get(socket.id)
    if (!entry) return

    Object.values(entry.consumers).forEach(({ consumer }) => consumer.close())
    Object.values(entry.plainTransports).forEach((t) => t.close())
    entry.transport.close()

    producersMap.delete(socket.id)
  })

  socket.on("disconnect", (reason) => {
    console.log("Client disconnected", socket.id, reason)

    const entry = producersMap.get(socket.id)
    if (!entry) return

    Object.values(entry.consumers).forEach(({ consumer }) => consumer.close())
    Object.values(entry.plainTransports).forEach((t) => t.close())
    entry.transport.close()
    if (entry.ffmpeg && !entry.ffmpeg.killed) {
      entry.ffmpeg.kill("SIGKILL")
    }
    producersMap.delete(socket.id)

    if (fs.existsSync(hlsDir)) {
      fs.rmSync(hlsDir, { recursive: true, force: true })
    }
  })
})

const PORT = config.https.listenPort
server.listen(PORT, async () => {
  router = await createWorker()
  console.log(`Server listening on http://localhost:${PORT}`)
})
