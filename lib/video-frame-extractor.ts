export async function extractFrameAtTime(videoElement: HTMLVideoElement, timestamp: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")

    if (!ctx) {
      reject(new Error("Could not get canvas context"))
      return
    }

    const seekHandler = () => {
      canvas.width = videoElement.videoWidth
      canvas.height = videoElement.videoHeight
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height)

      // Convert to base64
      const dataUrl = canvas.toDataURL("image/jpeg", 0.8)
      videoElement.removeEventListener("seeked", seekHandler)
      resolve(dataUrl)
    }

    videoElement.addEventListener("seeked", seekHandler)
    videoElement.currentTime = timestamp
  })
}

export async function extractFramesForBeats(
  videoUrl: string,
  timestamps: number[],
  onProgress?: (current: number, total: number) => void,
): Promise<Map<number, string>> {
  const video = document.createElement("video")
  video.src = videoUrl
  video.muted = true
  video.crossOrigin = "anonymous"

  // Wait for video to load
  await new Promise<void>((resolve, reject) => {
    video.addEventListener("loadedmetadata", () => resolve())
    video.addEventListener("error", reject)
    video.load()
  })

  const frames = new Map<number, string>()

  for (let i = 0; i < timestamps.length; i++) {
    const timestamp = timestamps[i]
    const frame = await extractFrameAtTime(video, timestamp)
    frames.set(timestamp, frame)

    if (onProgress) {
      onProgress(i + 1, timestamps.length)
    }
  }

  return frames
}
