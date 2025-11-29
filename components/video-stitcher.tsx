"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"

interface VideoStitcherProps {
  videoUrls: string[]
  audioUrl: string
  onComplete?: (videoUrl: string) => void
}

export function VideoStitcher({ videoUrls, audioUrl, onComplete }: VideoStitcherProps) {
  const [isStitching, setIsStitching] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState("")
  const [stitchedVideoUrl, setStitchedVideoUrl] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const stitchVideos = async () => {
    setIsStitching(true)
    setProgress(0)
    setStatus("Downloading videos...")

    try {
      const canvas = canvasRef.current!
      const ctx = canvas.getContext("2d")!

      // Set canvas size based on first video
      const firstVideo = document.createElement("video")
      firstVideo.crossOrigin = "anonymous"
      await new Promise((resolve, reject) => {
        firstVideo.onloadedmetadata = resolve
        firstVideo.onerror = reject
        firstVideo.src = videoUrls[0]
      })

      canvas.width = firstVideo.videoWidth || 1280
      canvas.height = firstVideo.videoHeight || 720

      setStatus("Preparing recorder...")

      // Create MediaRecorder for the canvas
      const stream = canvas.captureStream(30) // 30 FPS
      const audioContext = new AudioContext()

      // Load and decode audio
      setStatus("Loading audio...")
      const audioResponse = await fetch(audioUrl)
      const audioArrayBuffer = await audioResponse.arrayBuffer()
      const audioBuffer = await audioContext.decodeAudioData(audioArrayBuffer)

      // Create audio source
      const audioSource = audioContext.createBufferSource()
      audioSource.buffer = audioBuffer

      // Connect audio to stream
      const audioDestination = audioContext.createMediaStreamDestination()
      audioSource.connect(audioDestination)

      // Combine video and audio streams
      const audioTrack = audioDestination.stream.getAudioTracks()[0]
      stream.addTrack(audioTrack)

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "video/webm;codecs=vp9,opus",
        videoBitsPerSecond: 5000000, // 5 Mbps
      })

      const chunks: Blob[] = []
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: "video/webm" })
        const url = URL.createObjectURL(blob)
        setStitchedVideoUrl(url)
        setStatus("Video stitching complete!")
        setIsStitching(false)
        onComplete?.(url)
      }

      // Start recording and play videos
      mediaRecorder.start()
      audioSource.start()

      for (let i = 0; i < videoUrls.length; i++) {
        setStatus(`Processing video ${i + 1} of ${videoUrls.length}...`)
        setProgress(((i + 1) / videoUrls.length) * 100)

        const video = document.createElement("video")
        video.crossOrigin = "anonymous"
        video.src = videoUrls[i]

        await new Promise<void>((resolve, reject) => {
          video.onloadedmetadata = () => {
            video.play()
          }

          video.onplay = () => {
            const drawFrame = () => {
              if (video.paused || video.ended) {
                resolve()
                return
              }
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
              requestAnimationFrame(drawFrame)
            }
            drawFrame()
          }

          video.onended = resolve
          video.onerror = reject
        })
      }

      // Stop recording
      mediaRecorder.stop()
      audioContext.close()
    } catch (error) {
      console.error("[v0] Error stitching videos:", error)
      setStatus("Error: " + (error instanceof Error ? error.message : "Unknown error"))
      setIsStitching(false)
    }
  }

  return (
    <div className="space-y-4">
      <canvas ref={canvasRef} className="hidden" />
      <video ref={videoRef} className="hidden" />

      {!stitchedVideoUrl && (
        <div className="space-y-2">
          <Button onClick={stitchVideos} disabled={isStitching} className="w-full">
            {isStitching ? "Stitching Videos..." : "Stitch Videos with Audio"}
          </Button>

          {isStitching && (
            <>
              <Progress value={progress} className="w-full" />
              <p className="text-sm text-muted-foreground text-center">{status}</p>
            </>
          )}
        </div>
      )}

      {stitchedVideoUrl && (
        <div className="space-y-2">
          <video src={stitchedVideoUrl} controls className="w-full rounded-lg" />
          <Button
            onClick={() => {
              const a = document.createElement("a")
              a.href = stitchedVideoUrl
              a.download = "final-music-video.webm"
              a.click()
            }}
            className="w-full"
          >
            Download Final Video
          </Button>
        </div>
      )}
    </div>
  )
}
