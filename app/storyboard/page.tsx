"use client"

import type React from "react"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Download, Play, Pause, Trash2, Loader2 } from "lucide-react"
import { formatTime } from "@/lib/audio-analysis"
import { Background } from "@/components/background"

interface StoryboardItem {
  timestamp: number
  prompt: string
  duration?: number
  imageUrl?: string | null
  error?: string
  isGenerating?: boolean
  isRegeneratingWithCharacter?: boolean
  hasCharacterEdit?: boolean // Track if this scene has been edited with a character
}

export default function StoryboardPage() {
  const router = useRouter()
  const [items, setItems] = useState<StoryboardItem[]>([])
  const [audioFileName, setAudioFileName] = useState("")
  const [audioUrl, setAudioUrl] = useState("")
  const [playingIndex, setPlayingIndex] = useState<number | null>(null)
  const [audioProgress, setAudioProgress] = useState<{ [key: number]: number }>({})
  const [loadedFromCache, setLoadedFromCache] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationProgress, setGenerationProgress] = useState(0)
  const [imagesFromCache, setImagesFromCache] = useState(false)
  const [uploadingSceneIndex, setUploadingSceneIndex] = useState<number | null>(null)
  const audioRefs = useRef<{ [key: number]: HTMLAudioElement }>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadStoryboard()
  }, [])

  const loadStoryboard = async () => {
    const sessionData = sessionStorage.getItem("storyboardData")
    const sessionFileName = sessionStorage.getItem("audioFileName")
    const sessionAudioFile = sessionStorage.getItem("audioFile")

    if (sessionData) {
      console.log("[v0] Loading storyboard from sessionStorage")
      await loadFromData(JSON.parse(sessionData), sessionFileName || "", sessionAudioFile || "")
      return
    }

    console.log("[v0] Checking Redis cache for storyboard...")
    try {
      const response = await fetch("/api/get-cached-storyboard")
      const result = await response.json()

      if (result.cached && result.data) {
        console.log("[v0] Loading storyboard from Redis cache")
        await loadFromData(result.data.items, result.data.audioFileName, result.data.audioFileUrl || "")
        setLoadedFromCache(true)
        return
      }
    } catch (error) {
      console.error("[v0] Error loading from cache:", error)
    }

    console.log("[v0] No storyboard data found, redirecting to home")
    router.push("/")
  }

  const loadFromData = async (timelineItems: any[], fileName: string, audioFile: string) => {
    const itemsWithDuration = timelineItems.map((item: StoryboardItem, index: number) => ({
      ...item,
      duration: index < timelineItems.length - 1 ? timelineItems[index + 1].timestamp - item.timestamp : 3,
    }))

    setItems(itemsWithDuration)
    setAudioFileName(fileName)
    if (audioFile && audioFile.trim() !== "") {
      console.log("[v0] Setting audio URL:", audioFile)
      setAudioUrl(audioFile)
    } else {
      console.log("[v0] No valid audio URL provided")
    }

    try {
      const cacheResponse = await fetch("/api/get-cached-images")
      const cacheResult = await cacheResponse.json()

      if (cacheResult.cached && cacheResult.images && cacheResult.images.length > 0) {
        console.log("[v0] Loading", cacheResult.images.length, "cached images")
        console.log("[v0] First cached image:", cacheResult.images[0])
        console.log(
          "[v0] Current items timestamps:",
          itemsWithDuration.map((i) => i.timestamp),
        )

        const imageMap = new Map<number, string>()
        cacheResult.images.forEach((img: any) => {
          console.log("[v0] Caching image for timestamp:", img.timestamp, "URL:", img.imageUrl?.substring(0, 50))
          imageMap.set(img.timestamp, img.imageUrl)
        })

        const updatedItems = itemsWithDuration.map((item) => {
          const cachedUrl = imageMap.get(item.timestamp)
          console.log("[v0] Item timestamp:", item.timestamp, "has cached image:", !!cachedUrl)
          return {
            ...item,
            imageUrl: cachedUrl || null,
          }
        })

        console.log("[v0] Updated items with images:", updatedItems.filter((i) => i.imageUrl).length)
        setItems(updatedItems)
        setImagesFromCache(true)
      } else {
        console.log("[v0] No cached images found or cache empty")
      }
    } catch (error) {
      console.error("[v0] Error loading cached images:", error)
    }
  }

  const handleClearImageCache = async () => {
    try {
      await fetch("/api/clear-image-cache", { method: "POST" })
      setItems((prev) => prev.map((item) => ({ ...item, imageUrl: null })))
      setImagesFromCache(false)
      alert("Image cache cleared successfully")
    } catch (error) {
      console.error("[v0] Error clearing image cache:", error)
      alert("Failed to clear image cache")
    }
  }

  const handleClearCache = async () => {
    try {
      await fetch("/api/cache-storyboard", { method: "DELETE" })
      await fetch("/api/clear-image-cache", { method: "POST" })
      sessionStorage.removeItem("storyboardData")
      sessionStorage.removeItem("audioFileName")
      sessionStorage.removeItem("audioFile")
      alert("Cache cleared successfully")
      router.push("/")
    } catch (error) {
      console.error("[v0] Error clearing cache:", error)
      alert("Failed to clear cache")
    }
  }

  const handleExportStoryboard = () => {
    const exportData = items.map((item) => ({
      timestamp: item.timestamp,
      prompt: item.prompt,
      duration: item.duration,
    }))

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "storyboard-export.json"
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleGenerateImages = async () => {
    if (items.length === 0) {
      alert("No scenes to generate images for")
      return
    }

    setIsGenerating(true)
    setGenerationProgress(0)

    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        isGenerating: true,
        error: undefined,
      })),
    )

    try {
      console.log("[v0] Starting streaming image generation for", items.length, "scenes")

      const prompts = items.map((item) => ({
        timestamp: item.timestamp,
        prompt: item.prompt,
      }))

      const response = await fetch("/api/generate-storyboard-images-stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompts }),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error("No response body")
      }

      let completedCount = 0

      while (true) {
        const { done, value } = await reader.read()

        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split("\n")

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6)

            if (data === "[DONE]") {
              console.log("[v0] All images generated")
              setGenerationProgress(100)
              continue
            }

            try {
              const result = JSON.parse(data)
              console.log(`[v0] Received result for scene ${result.index + 1}:`, result.imageUrl ? "success" : "failed")

              setItems((prev) =>
                prev.map((item, idx) => {
                  if (item.timestamp === result.timestamp) {
                    completedCount++
                    const progress = Math.round((completedCount / prompts.length) * 100)
                    setGenerationProgress(progress)

                    return {
                      ...item,
                      imageUrl: result.imageUrl || null,
                      error: result.error || undefined,
                      isGenerating: false,
                    }
                  }
                  return item
                }),
              )
            } catch (parseError) {
              console.error("[v0] Failed to parse result:", parseError)
            }
          }
        }
      }

      alert(`Image generation complete! ${completedCount} out of ${items.length} images generated successfully.`)
    } catch (error) {
      console.error("[v0] Error generating images:", error)
      setItems((prev) => prev.map((item) => ({ ...item, isGenerating: false })))
      alert(`Failed to generate images: ${error instanceof Error ? error.message : "Unknown error"}`)
      setGenerationProgress(0)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleCharacterUpload = (index: number) => {
    setUploadingSceneIndex(index)
    fileInputRef.current?.click()
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || uploadingSceneIndex === null) return

    const sceneIndex = uploadingSceneIndex
    const scene = items[sceneIndex]

    if (!scene.imageUrl) {
      alert("Please generate the base image first before adding a character")
      return
    }

    setItems((prev) =>
      prev.map((item, idx) => (idx === sceneIndex ? { ...item, isRegeneratingWithCharacter: true } : item)),
    )

    try {
      const reader = new FileReader()
      reader.onload = async (e) => {
        const characterImageBase64 = e.target?.result as string

        console.log(`[v0] Regenerating scene ${sceneIndex + 1} with character reference`)

        const response = await fetch("/api/regenerate-with-character", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sceneImageUrl: scene.imageUrl,
            characterImageBase64,
            prompt: scene.prompt,
            timestamp: scene.timestamp,
          }),
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const result = await response.json()

        if (result.imageUrl) {
          console.log(`[v0] Character regeneration successful for scene ${sceneIndex + 1}`)
          setItems((prev) =>
            prev.map((item, idx) =>
              idx === sceneIndex
                ? { ...item, imageUrl: result.imageUrl, isRegeneratingWithCharacter: false, hasCharacterEdit: true } // Mark as edited
                : item,
            ),
          )
          alert("Scene regenerated with your character!")
        } else {
          throw new Error(result.error || "Failed to regenerate scene")
        }
      }

      reader.onerror = () => {
        throw new Error("Failed to read image file")
      }

      reader.readAsDataURL(file)
    } catch (error) {
      console.error("[v0] Error regenerating with character:", error)
      alert(`Failed to regenerate scene: ${error instanceof Error ? error.message : "Unknown error"}`)
      setItems((prev) =>
        prev.map((item, idx) => (idx === sceneIndex ? { ...item, isRegeneratingWithCharacter: false } : item)),
      )
    } finally {
      setUploadingSceneIndex(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleRevertToOriginal = async (index: number) => {
    const scene = items[index]

    if (!scene.hasCharacterEdit) {
      return
    }

    setItems((prev) => prev.map((item, idx) => (idx === index ? { ...item, isRegeneratingWithCharacter: true } : item)))

    try {
      const response = await fetch("/api/revert-to-original", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          timestamp: scene.timestamp,
          prompt: scene.prompt,
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()

      if (result.imageUrl) {
        console.log(`[v0] Reverted scene ${index + 1} to original`)
        setItems((prev) =>
          prev.map((item, idx) =>
            idx === index
              ? { ...item, imageUrl: result.imageUrl, isRegeneratingWithCharacter: false, hasCharacterEdit: false }
              : item,
          ),
        )
        alert("Reverted to original scene!")
      } else {
        throw new Error(result.error || "Failed to revert scene")
      }
    } catch (error) {
      console.error("[v0] Error reverting to original:", error)
      alert(`Failed to revert scene: ${error instanceof Error ? error.message : "Unknown error"}`)
      setItems((prev) =>
        prev.map((item, idx) => (idx === index ? { ...item, isRegeneratingWithCharacter: false } : item)),
      )
    }
  }

  const togglePlayPause = (index: number, timestamp: number, duration: number) => {
    if (!audioUrl || audioUrl.trim() === "") {
      console.error("[v0] Cannot play audio: No valid audio URL")
      alert("Audio file not available. Please regenerate the storyboard from the editor.")
      return
    }

    const currentAudio = audioRefs.current[index]

    if (playingIndex === index && currentAudio && !currentAudio.paused) {
      currentAudio.pause()
      setPlayingIndex(null)
    } else {
      Object.values(audioRefs.current).forEach((audio) => audio.pause())

      if (!currentAudio) {
        console.log("[v0] Creating new audio element for index:", index, "with URL:", audioUrl)
        const audio = new Audio(audioUrl)

        audio.addEventListener("error", (e) => {
          console.error("[v0] Audio loading error:", e)
          alert("Failed to load audio. Please check the audio file.")
          setPlayingIndex(null)
        })

        audio.currentTime = timestamp
        audioRefs.current[index] = audio

        audio.addEventListener("timeupdate", () => {
          const elapsed = audio.currentTime - timestamp
          const progress = Math.min((elapsed / duration) * 100, 100)
          setAudioProgress((prev) => ({ ...prev, [index]: progress }))

          if (audio.currentTime >= timestamp + duration) {
            audio.pause()
            setPlayingIndex(null)
            setAudioProgress((prev) => ({ ...prev, [index]: 0 }))
          }
        })

        audio.play().catch((error) => {
          console.error("[v0] Audio play error:", error)
          alert("Failed to play audio.")
          setPlayingIndex(null)
        })
        setPlayingIndex(index)
      } else if (currentAudio) {
        currentAudio.currentTime = timestamp
        currentAudio.play().catch((error) => {
          console.error("[v0] Audio play error:", error)
          alert("Failed to play audio.")
          setPlayingIndex(null)
        })
        setPlayingIndex(index)
      }
    }
  }

  return (
    <main className="p-inset h-screen w-full overflow-hidden">
      <div className="relative h-full w-full">
        <Background src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/alt-g7Cv2QzqL3k6ey3igjNYkM32d8Fld7.mp4" placeholder="/alt-placeholder.png" />

        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

        <div className="relative z-10 h-full w-full overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto flex flex-col gap-8">
            <div className="flex items-center justify-between backdrop-blur-xl bg-background/60 border-2 border-white/10 rounded-2xl p-6">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => router.push("/")}
                  className="backdrop-blur-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white transition-all"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                  <h1 className="text-3xl font-bold text-white">Storyboard Preview</h1>
                  <p className="text-sm text-white/60">
                    {audioFileName} • {items.length} scenes
                    {loadedFromCache && " • Loaded from cache"}
                    {imagesFromCache && " • Images cached"}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {imagesFromCache && (
                  <Button
                    onClick={handleClearImageCache}
                    variant="outline"
                    size="sm"
                    className="gap-2 backdrop-blur-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white transition-all"
                    title="Clear generated images"
                  >
                    <Trash2 className="h-4 w-4" />
                    Clear Images
                  </Button>
                )}
                <Button
                  onClick={handleClearCache}
                  variant="outline"
                  size="icon"
                  className="backdrop-blur-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white transition-all"
                  title="Clear all cache"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button
                  onClick={handleExportStoryboard}
                  variant="outline"
                  className="gap-2 backdrop-blur-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white transition-all"
                >
                  <Download className="h-4 w-4" />
                  Export
                </Button>
                <Button
                  onClick={handleGenerateImages}
                  disabled={isGenerating}
                  className="gap-2 backdrop-blur-xl bg-primary/80 hover:bg-primary/90 border border-white/20 text-primary-foreground transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGenerating ? "Generating..." : "Generate Images"}
                </Button>
                {imagesFromCache && (
                  <Button
                    onClick={() => router.push("/render")}
                    className="gap-2 backdrop-blur-xl bg-green-500/80 hover:bg-green-500/90 border border-white/20 text-white transition-all shadow-lg"
                  >
                    <Play className="h-4 w-4" />
                    Render Videos
                  </Button>
                )}
              </div>
            </div>

            {isGenerating && (
              <div className="backdrop-blur-xl bg-background/60 border-2 border-white/10 rounded-2xl p-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-white">Generating storyboard images...</span>
                      <span className="text-sm text-white/60">{generationProgress}%</span>
                    </div>
                    <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${generationProgress}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="columns-1 md:columns-2 lg:columns-3 gap-4 space-y-4">
              {items.map((item, index) => {
                const isPlaying = playingIndex === index
                const progress = audioProgress[index] || 0

                return (
                  <div key={index} className="break-inside-avoid mb-4">
                    <div className="flex flex-col gap-3 p-4 border-2 border-white/10 rounded-xl bg-background/40 backdrop-blur-xl hover:border-primary/50 transition-all shadow-lg">
                      <div className="relative aspect-video w-full bg-gradient-to-br from-primary/30 to-primary/10 rounded-lg overflow-hidden border border-white/20 group">
                        {item.isGenerating || item.isRegeneratingWithCharacter ? (
                          <div className="w-full h-full flex items-center justify-center">
                            <div className="text-center">
                              <Loader2 className="h-12 w-12 text-primary animate-spin mx-auto mb-3" />
                              <div className="text-sm text-white/70">
                                {item.isRegeneratingWithCharacter ? "Adding character..." : "Generating image..."}
                              </div>
                            </div>
                          </div>
                        ) : item.imageUrl ? (
                          <>
                            <img
                              src={item.imageUrl || "/placeholder.svg"}
                              alt={item.prompt}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100">
                              <div className="flex gap-2">
                                <Button
                                  onClick={() => handleCharacterUpload(index)}
                                  className="backdrop-blur-xl bg-white/10 hover:bg-white/20 border border-white/30 text-white transition-all"
                                  size="sm"
                                >
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="mr-2"
                                  >
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="17 8 12 3 7 8" />
                                    <line x1="12" x2="12" y1="3" y2="15" />
                                  </svg>
                                  {item.hasCharacterEdit ? "Replace Character" : "Add Character"}
                                </Button>
                                {item.hasCharacterEdit && (
                                  <Button
                                    onClick={() => handleRevertToOriginal(index)}
                                    className="backdrop-blur-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-white transition-all"
                                    size="sm"
                                  >
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      width="16"
                                      height="16"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      className="mr-2"
                                    >
                                      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                                      <path d="M21 3v5h-5" />
                                      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                                      <path d="M3 21v-5h5" />
                                    </svg>
                                    Revert
                                  </Button>
                                )}
                              </div>
                            </div>
                          </>
                        ) : item.error ? (
                          <div className="w-full h-full flex items-center justify-center p-4">
                            <div className="text-center">
                              <div className="text-sm text-red-400 mb-2">Failed to generate</div>
                              <div className="text-xs text-white/50">{item.error}</div>
                            </div>
                          </div>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <div className="text-center p-4">
                              <div className="text-5xl font-bold text-white/40 mb-2">Scene {index + 1}</div>
                              <div className="text-sm font-semibold text-white/50">{formatTime(item.timestamp)}</div>
                            </div>
                          </div>
                        )}
                      </div>

                      <p className="text-sm text-white/90 leading-relaxed">{item.prompt}</p>

                      {audioUrl && audioUrl.trim() !== "" && (
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => togglePlayPause(index, item.timestamp, item.duration || 3)}
                            className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/80 hover:bg-primary/90 border border-white/20 text-white transition-all backdrop-blur-xl flex-shrink-0"
                          >
                            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
                          </button>

                          <div className="flex-1 h-2 bg-white/20 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all duration-100 ease-linear"
                              style={{ width: isPlaying ? `${progress}%` : "0%" }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
