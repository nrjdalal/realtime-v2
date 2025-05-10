## What's left to do?

- [ ] Optimize stream startup time, currently it takes 7-15 seconds for /watch page to show the stream (needs better understanding of `ffmpeg` initial transcoding args)
- [ ] Work on /watch page like a video player and loader, etc and adding a screen sharing feature

## How to run the project?

1. Clone the repository.

```sh
pnpx gitpick https://github.com/nrjdalal/realtime-v2
```

2. Install dependencies, rebuild binaries and run the server.

> [!IMPORTANT]
> Make sure `ffmpeg` is installed on your system. You can install it using `brew install ffmpeg` on macOS.

```sh
pnpm install
npm rebuild mediasoup
pnpm run dev
```

- Visit `http://localhost:3000/stream` to start the stream.
- Visit `http://localhost:3000/watch` to watch the stream (after 7-15 seconds).

> [!NOTE]
> Make sure to rebuild the `mediasoup` package using `npm` instead of `pnpm`.
