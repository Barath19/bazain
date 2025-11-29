"use client"

import { useState, useEffect } from "react"
import { Button } from "./ui/button"
import { analyzeBeatTimestamps, analyzeAudioCharacteristics, type BeatTimestamp } from "@/lib/audio-analysis"
import { AudioWaveform } from "./audio-waveform"
import { TimelineEditor } from "./timeline-editor"
import { Loader2, Settings2, Film } from "lucide-react"
import { Slider } from "./ui/slider"
import { useRouter } from "next/navigation"

interface AudioVideoEditorProps {
  audioFile: File
  videoUrl: string
}

interface TimelineItem {
  timestamp: number
  prompt: string
}

type ProcessingStage = "idle" | "analyzing-audio" | "generating-prompts" | "complete"

export function AudioVideoEditor({ audioFile, videoUrl }: AudioVideoEditorProps) {
  const [stage, setStage] = useState<ProcessingStage>("idle")
  const [beats, setBeats] = useState<BeatTimestamp[]>([])
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([])
  const [beatSensitivity, setBeatSensitivity] = useState(1.0)
  const [showSensitivity, setShowSensitivity] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (audioFile && stage === "idle") {
      analyzeAudio()
    }
  }, [audioFile])

  const analyzeAudio = async () => {
    try {
      setStage("analyzing-audio")
      console.log("[v0] Starting audio beat analysis...")
      const detectedBeats = await analyzeBeatTimestamps(audioFile, beatSensitivity)
      setBeats(detectedBeats)
      console.log("[v0] Beat analysis complete, showing timeline")
      setStage("complete")
    } catch (error) {
      console.error("[v0] Error analyzing audio:", error)
      setStage("idle")
      alert("Failed to analyze audio. Please try again.")
    }
  }

  const handleStartProcessing = async () => {
    if (beats.length === 0) return

    try {
      setStage("generating-prompts")
      console.log("[v0] Generating scene prompts with OpenAI...")

      console.log("[v0] Extracting audio characteristics...")
      const audioCharacteristics = await analyzeAudioCharacteristics(audioFile, beats)
      console.log("[v0] Audio analysis complete:", {
        tempo: audioCharacteristics.tempo,
        energy: audioCharacteristics.overallEnergy,
        duration: audioCharacteristics.duration,
      })

      const response = await fetch("/api/generate-scene-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioCharacteristics,
          audioName: audioFile.name,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to generate scene prompts")
      }

      const { prompts } = (await response.json()) as {
        prompts: Array<{ timestamp: number; prompt: string }>
      }
      console.log("[v0] Generated prompts:", prompts.length)

      const items: TimelineItem[] = prompts.map((p) => ({
        timestamp: p.timestamp,
        prompt: p.prompt,
      }))

      setTimelineItems(items)
      setStage("complete")
    } catch (error) {
      console.error("[v0] Error during processing:", error)
      setStage("complete")
      alert(error instanceof Error ? error.message : "An error occurred during processing. Please try again.")
    }
  }

  const handlePromptChange = (timestamp: number, newPrompt: string) => {
    setTimelineItems((prev) =>
      prev.map((item) => (item.timestamp === timestamp ? { ...item, prompt: newPrompt } : item)),
    )
  }

  const handleRegeneratePrompt = async (timestamp: number) => {
    alert("Regeneration feature coming soon. You can manually edit the prompt for now.")
  }

  const handleExport = () => {
    const exportData = timelineItems.map((item) => ({
      timestamp: item.timestamp,
      prompt: item.prompt,
    }))

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "music-video-prompts.json"
    a.click()
    URL.revokeObjectURL(url)
  }

  const getStageMessage = () => {
    switch (stage) {
      case "analyzing-audio":
        return "Analyzing audio for beats..."
      case "generating-prompts":
        return "Generating scene prompts with AI..."
      case "complete":
        return "Processing complete!"
      default:
        return ""
    }
  }

  const handleSensitivityChange = async (value: number[]) => {
    const newSensitivity = value[0]
    setBeatSensitivity(newSensitivity)

    if (beats.length > 0) {
      try {
        setStage("analyzing-audio")
        const detectedBeats = await analyzeBeatTimestamps(audioFile, newSensitivity)
        setBeats(detectedBeats)
        setStage("complete")
        setTimelineItems([])
      } catch (error) {
        console.error("[v0] Error re-analyzing audio:", error)
        setStage("complete")
      }
    }
  }

  const handleGenerateStoryboard = async () => {
    if (timelineItems.length === 0) {
      alert("Please generate scene prompts first")
      return
    }

    const storyboardData = {
      items: timelineItems,
      audioFileName: audioFile.name,
      audioFileUrl: URL.createObjectURL(audioFile),
      cachedAt: Date.now(),
    }

    // Store in sessionStorage for immediate access
    sessionStorage.setItem("storyboardData", JSON.stringify(timelineItems))
    sessionStorage.setItem("audioFileName", audioFile.name)
    sessionStorage.setItem("audioFile", URL.createObjectURL(audioFile))

    // Cache to Redis for debugging persistence
    try {
      await fetch("/api/cache-storyboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(storyboardData),
      })
      console.log("[v0] Storyboard cached to Redis")
    } catch (error) {
      console.error("[v0] Failed to cache to Redis:", error)
    }

    router.push("/storyboard")
  }

  return (
    <div className="flex flex-col gap-6 w-full">
      {stage === "analyzing-audio" && (
        <div className="flex flex-col items-center gap-4 p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium text-foreground">Analyzing audio for beats...</p>
        </div>
      )}

      {stage === "complete" && (
        <div className="flex flex-col gap-6">
          {showSensitivity && (
            <div className="flex flex-col gap-3 p-4 border border-border/50 rounded-lg bg-background/50 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-foreground">Beat Sensitivity</label>
                  <p className="text-xs text-foreground/60">Lower = 2s intervals, Higher = 4s intervals</p>
                </div>
                <span className="text-sm font-semibold text-foreground">{beats.length} beats</span>
              </div>
              <Slider
                value={[beatSensitivity]}
                onValueChange={handleSensitivityChange}
                min={0}
                max={2}
                step={0.1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-foreground/50">
                <span>More beats (2s)</span>
                <span>Fewer beats (4s)</span>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Audio Timeline</h3>
              <div className="flex items-center gap-3">
                <span className="text-sm text-foreground/60">{beats.length} beats detected</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowSensitivity(!showSensitivity)}
                  className="h-8 w-8"
                >
                  <Settings2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <AudioWaveform audioFile={audioFile} beats={beats} />
          </div>

          {timelineItems.length === 0 ? (
            <div className="flex flex-col items-center gap-4">
              <p className="text-sm text-foreground/70 text-center">
                Ready to generate AI scene prompts based on the audio and beat timestamps
              </p>
              <Button onClick={handleStartProcessing} size="lg" className="px-8">
                Generate Scene Prompts
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">Generated Scene Prompts</h3>
                <div className="flex items-center gap-2">
                  <Button onClick={handleExport} variant="outline" size="sm">
                    Export JSON
                  </Button>
                  <Button onClick={handleGenerateStoryboard} size="sm" className="gap-2">
                    <Film className="h-4 w-4" />
                    Generate Storyboard
                  </Button>
                </div>
              </div>
              <TimelineEditor
                items={timelineItems}
                onPromptChange={handlePromptChange}
                onRegeneratePrompt={handleRegeneratePrompt}
              />
            </div>
          )}
        </div>
      )}

      {stage === "generating-prompts" && (
        <div className="flex flex-col items-center gap-4 p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium text-foreground">{getStageMessage()}</p>
        </div>
      )}
    </div>
  )
}
