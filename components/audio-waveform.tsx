"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import type { BeatTimestamp } from "@/lib/audio-analysis"
import { Button } from "./ui/button"
import { Play, Pause } from "lucide-react"

interface AudioWaveformProps {
  audioFile: File
  beats: BeatTimestamp[]
}

export function AudioWaveform({ audioFile, beats }: AudioWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const playheadCanvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const animationFrameRef = useRef<number>()
  const durationRef = useRef(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [audioUrl, setAudioUrl] = useState<string>("")

  useEffect(() => {
    const url = URL.createObjectURL(audioFile)
    setAudioUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [audioFile])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const drawWaveform = async () => {
      const audioContext = new AudioContext()

      const arrayBuffer = await audioFile.arrayBuffer()
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
      durationRef.current = audioBuffer.duration

      const channelData = audioBuffer.getChannelData(0)
      const samples = 1000
      const blockSize = Math.floor(channelData.length / samples)

      const width = canvas.width
      const height = canvas.height
      const barWidth = width / samples

      // Clear canvas
      ctx.clearRect(0, 0, width, height)

      // Draw waveform
      ctx.fillStyle = "hsl(var(--foreground) / 0.2)"
      for (let i = 0; i < samples; i++) {
        let sum = 0
        for (let j = 0; j < blockSize; j++) {
          sum += Math.abs(channelData[i * blockSize + j])
        }
        const average = sum / blockSize
        const barHeight = average * height * 2

        ctx.fillRect(i * barWidth, (height - barHeight) / 2, barWidth - 1, barHeight)
      }

      // Draw beat markers overlaid on waveform
      ctx.fillStyle = "hsl(var(--primary))"
      beats.forEach((beat) => {
        const x = (beat.time / audioBuffer.duration) * width
        ctx.fillRect(x - 1, 0, 3, height)
      })

      audioContext.close()
    }

    drawWaveform()
  }, [audioFile, beats])

  useEffect(() => {
    if (!isPlaying) return

    const updatePlayhead = () => {
      if (audioRef.current) {
        setCurrentTime(audioRef.current.currentTime)
      }
      animationFrameRef.current = requestAnimationFrame(updatePlayhead)
    }

    animationFrameRef.current = requestAnimationFrame(updatePlayhead)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [isPlaying])

  useEffect(() => {
    const canvas = playheadCanvasRef.current
    if (!canvas || durationRef.current === 0) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height

    // Clear playhead canvas
    ctx.clearRect(0, 0, width, height)

    // Draw white playhead line
    const playheadX = (currentTime / durationRef.current) * width
    ctx.strokeStyle = "white"
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(playheadX, 0)
    ctx.lineTo(playheadX, height)
    ctx.stroke()
  }, [currentTime])

  const handlePlayPause = () => {
    if (!audioRef.current) return

    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      audioRef.current.play()
      setIsPlaying(true)
    }
  }

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || !audioRef.current) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percentage = x / canvas.width
    const time = percentage * durationRef.current

    audioRef.current.currentTime = time
    setCurrentTime(time)
  }

  const handleAudioEnded = () => {
    setIsPlaying(false)
    setCurrentTime(0)
    if (audioRef.current) {
      audioRef.current.currentTime = 0
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={1000}
          height={120}
          onClick={handleCanvasClick}
          className="w-full h-32 rounded-lg bg-muted/20 border border-border/50 cursor-pointer hover:border-primary/50 transition-colors absolute inset-0"
        />
        <canvas
          ref={playheadCanvasRef}
          width={1000}
          height={120}
          onClick={handleCanvasClick}
          className="w-full h-32 rounded-lg cursor-pointer absolute inset-0 pointer-events-none"
        />
        <div className="w-full h-32" />
      </div>

      <div className="flex items-center gap-4">
        <Button onClick={handlePlayPause} size="sm" variant="outline" className="w-20 bg-transparent">
          {isPlaying ? (
            <>
              <Pause className="w-4 h-4 mr-1" />
              Pause
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-1" />
              Play
            </>
          )}
        </Button>

        <span className="text-sm font-mono text-foreground/70">
          {formatTime(currentTime)} / {formatTime(durationRef.current)}
        </span>

        <span className="text-xs text-foreground/50 ml-auto">Click waveform to seek • Beat lines in primary color</span>
      </div>

      {audioUrl && <audio ref={audioRef} src={audioUrl} onEnded={handleAudioEnded} />}
    </div>
  )
}
