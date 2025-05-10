import * as mediasoup from "mediasoup"

import config from "@/config"

let worker: mediasoup.types.Worker

const createWorker = async () => {
  worker = await mediasoup.createWorker(config.mediasoup.worker)
  worker.on("died", () => {
    console.error("mediasoup Worker died, exiting in 2 seconds... [pid:%d]", worker.pid)
    setTimeout(() => process.exit(1), 2000)
  })
  return await worker.createRouter(config.mediasoup.router)
}

export { createWorker }
