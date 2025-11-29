"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Trash2, Loader2, CheckCircle, XCircle, Clock } from "lucide-react"
import { formatTime } from "@/lib/audio-analysis"
import { Background } from "@/components/background"
import { VideoStitcher } from "@/components/video-stitcher"

interface VideoItem {
  timestamp: number
  prompt: string
  duration: number
  imageUrl: string
  videoUrl?: string
  status: "pending" | "queued" | "processing" | "completed" | "failed"
  jobId?: string
  error?: string
}

export default function RenderPage() {
  const router = useRouter()
  const [items, setItems] = useState<VideoItem[]>([])
  const [audioFileName, setAudioFileName] = useState("")
  const [audioUrl, setAudioUrl] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationProgress, setGenerationProgress] = useState(0)
  const [videosFromCache, setVideosFromCache] = useState(false)
  const [stitchedVideo, setStitchedVideo] = useState<{
    videoUrl: string
    status: "processing" | "completed" | "failed"
  } | null>(null)
  const [isStitching, setIsStitching] = useState(false)
  const [showStitcher, setShowStitcher] = useState(false)

  useEffect(() => {
    loadRenderData()
  }, [])

  const loadRenderData = async () => {
    const sessionData = sessionStorage.getItem("storyboardData")
    const sessionFileName = sessionStorage.getItem("audioFileName")
    const sessionAudioFile = sessionStorage.getItem("audioFile")

    if (!sessionData) {
      try {
        const storyboardResponse = await fetch("/api/get-cached-storyboard")
        const storyboardResult = await storyboardResponse.json()

        if (storyboardResult.cached && storyboardResult.data) {
          await loadFromData(
            storyboardResult.data.items,
            storyboardResult.data.audioFileName,
            storyboardResult.data.audioFileUrl || "",
          )
          return
        }
      } catch (error) {
        console.error("[v0] Error loading from cache:", error)
      }

      console.log("[v0] No storyboard data found, redirecting to storyboard")
      router.push("/storyboard")
      return
    }

    await loadFromData(JSON.parse(sessionData), sessionFileName || "", sessionAudioFile || "")
  }

  const loadFromData = async (timelineItems: any[], fileName: string, audioFile: string) => {
    const itemsWithDuration = timelineItems.map((item: VideoItem, index: number) => ({
      ...item,
      duration: index < timelineItems.length - 1 ? timelineItems[index + 1].timestamp - item.timestamp : 3,
      status: "pending" as const,
    }))

    setItems(itemsWithDuration)
    setAudioFileName(fileName)
    setAudioUrl(audioFile)

    try {
      const imagesResponse = await fetch("/api/get-cached-images")
      const imagesResult = await imagesResponse.json()

      if (imagesResult.cached && imagesResult.images && imagesResult.images.length > 0) {
        console.log("[v0] Loading", imagesResult.images.length, "cached images for video generation")
        const imageMap = new Map<number, string>()
        imagesResult.images.forEach((img: any) => {
          imageMap.set(img.timestamp, img.imageUrl)
        })

        setItems((prev) =>
          prev.map((item) => ({
            ...item,
            imageUrl: imageMap.get(item.timestamp) || "",
          })),
        )
      }
    } catch (error) {
      console.error("[v0] Error loading cached images:", error)
    }

    try {
      const videosResponse = await fetch("/api/get-cached-videos")
      const videosResult = await videosResponse.json()

      if (videosResult.cached && videosResult.videos && videosResult.videos.length > 0) {
        console.log("[v0] Loading", videosResult.videos.length, "cached videos")
        const videoMap = new Map<number, any>()
        videosResult.videos.forEach((vid: any) => {
          videoMap.set(vid.timestamp, vid)
        })

        setItems((prev) =>
          prev.map((item) => {
            const cachedVideo = videoMap.get(item.timestamp)
            if (cachedVideo) {
              return {
                ...item,
                videoUrl: cachedVideo.videoUrl,
                status: cachedVideo.status,
                jobId: cachedVideo.jobId,
                error: cachedVideo.error,
              }
            }
            return item
          }),
        )
        setVideosFromCache(true)
      }
    } catch (error) {
      console.error("[v0] Error loading cached videos:", error)
    }

    try {
      const stitchedResponse = await fetch("/api/get-stitched-video")
      const stitchedResult = await stitchedResponse.json()

      console.log("[v0] Stitched video API response:", stitchedResult)

      if (stitchedResult.stitchedVideo) {
        console.log("[v0] Setting stitched video state:", {
          videoUrl: stitchedResult.stitchedVideo.videoUrl,
          status: stitchedResult.stitchedVideo.status,
        })
        setStitchedVideo({
          videoUrl: stitchedResult.stitchedVideo.videoUrl,
          status: stitchedResult.stitchedVideo.status,
        })
      } else {
        console.log("[v0] No stitched video found in response")
      }
    } catch (error) {
      console.error("[v0] Error loading cached stitched video:", error)
    }
  }

  const handleGenerateVideos = async () => {
    const missingImages = items.filter((item) => !item.imageUrl)
    if (missingImages.length > 0) {
      alert("Please generate all images in the storyboard first before creating videos")
      return
    }

    setIsGenerating(true)
    setGenerationProgress(0)

    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        status: "pending" as const,
        error: undefined,
      })),
    )

    try {
      console.log("[v0] Starting video generation for", items.length, "scenes")

      const prompts = items.map((item) => ({
        timestamp: item.timestamp,
        prompt: item.prompt,
        imageUrl: item.imageUrl,
        audioDuration: item.duration,
      }))

      const response = await fetch("/api/generate-videos-stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompts, audioUrl }),
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
              console.log("[v0] All videos generated")
              setGenerationProgress(100)
              continue
            }

            try {
              const result = JSON.parse(data)
              console.log(`[v0] Received result for scene ${result.index + 1}:`, result.status)

              setItems((prev) =>
                prev.map((item) => {
                  if (item.timestamp === result.timestamp) {
                    if (result.status === "completed") {
                      completedCount++
                      const progress = Math.round((completedCount / prompts.length) * 100)
                      setGenerationProgress(progress)
                    }

                    return {
                      ...item,
                      videoUrl: result.videoUrl || item.videoUrl,
                      status: result.status || item.status,
                      jobId: result.jobId || item.jobId,
                      error: result.error || item.error,
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

      alert(`Video generation complete! ${completedCount} out of ${items.length} videos generated successfully.`)

      if (completedCount === items.length) {
        console.log("[v0] All videos completed, auto-stitching...")
        await handleStitchVideos()
      }
    } catch (error) {
      console.error("[v0] Error generating videos:", error)
      alert(`Failed to generate videos: ${error instanceof Error ? error.message : "Unknown error"}`)
      setGenerationProgress(0)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleStitchVideos = async () => {
    const completedVideos = items.filter((item) => item.status === "completed" && item.videoUrl)

    if (completedVideos.length === 0) {
      alert("No completed videos to stitch")
      return
    }

    if (completedVideos.length < items.length) {
      const proceed = confirm(
        `Only ${completedVideos.length} out of ${items.length} videos are completed. Do you want to stitch only the completed videos?`,
      )
      if (!proceed) return
    }

    setShowStitcher(true)
  }

  const handleStitchComplete = (videoUrl: string) => {
    setStitchedVideo({
      videoUrl: videoUrl,
      status: "completed",
    })
    setShowStitcher(false)
    alert("Final music video created successfully!")
  }

  const handleClearVideoCache = async () => {
    try {
      await fetch("/api/clear-video-cache", { method: "POST" })
      setItems((prev) => prev.map((item) => ({ ...item, videoUrl: undefined, status: "pending" as const })))
      setVideosFromCache(false)
      setStitchedVideo(null)
      alert("Video cache cleared successfully")
    } catch (error) {
      console.error("[v0] Error clearing video cache:", error)
      alert("Failed to clear video cache")
    }
  }

  const getStatusIcon = (status: VideoItem["status"]) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-5 w-5 text-green-400" />
      case "failed":
        return <XCircle className="h-5 w-5 text-red-400" />
      case "processing":
      case "queued":
        return <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
      default:
        return <Clock className="h-5 w-5 text-white/40" />
    }
  }

  const getStatusText = (status: VideoItem["status"]) => {
    switch (status) {
      case "completed":
        return "Completed"
      case "failed":
        return "Failed"
      case "processing":
        return "Processing..."
      case "queued":
        return "Queued"
      default:
        return "Pending"
    }
  }

  return (
    <main className="p-inset h-screen w-full overflow-hidden">
      <div className="relative h-full w-full">
        <Background src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/alt-g7Cv2QzqL3k6ey3igjNYkM32d8Fld7.mp4" placeholder="/alt-placeholder.png" />

        <div className="relative z-10 h-full w-full overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto flex flex-col gap-8">
            <div className="flex items-center justify-between backdrop-blur-xl bg-background/60 border-2 border-white/10 rounded-2xl p-6">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => router.push("/storyboard")}
                  className="backdrop-blur-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white transition-all"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                  <h1 className="text-3xl font-bold text-white">Video Rendering</h1>
                  <p className="text-sm text-white/60">
                    {audioFileName} • {items.length} scenes
                    {videosFromCache && " • Videos cached"}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {videosFromCache && (
                  <Button
                    onClick={handleClearVideoCache}
                    variant="outline"
                    size="sm"
                    className="gap-2 backdrop-blur-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white transition-all"
                    title="Clear generated videos"
                  >
                    <Trash2 className="h-4 w-4" />
                    Clear Videos
                  </Button>
                )}
                {items.some((item) => item.status === "completed") && (
                  <Button
                    onClick={handleStitchVideos}
                    disabled={isStitching}
                    variant="outline"
                    className="gap-2 backdrop-blur-xl bg-white/5 border border-white/20 hover:bg-white/10 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isStitching ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Stitching...
                      </>
                    ) : (
                      "Stitch Videos"
                    )}
                  </Button>
                )}
                <Button
                  onClick={handleGenerateVideos}
                  disabled={isGenerating}
                  className="gap-2 backdrop-blur-xl bg-primary/80 hover:bg-primary/90 border border-white/20 text-primary-foreground transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGenerating ? "Generating..." : "Generate Videos"}
                </Button>
              </div>
            </div>

            {stitchedVideo && (
              <div className="backdrop-blur-xl bg-background/60 border-2 border-white/10 rounded-2xl p-6">
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-white">Final Music Video</h2>
                    {stitchedVideo.status === "processing" && (
                      <div className="flex items-center gap-2 text-sm text-white/60">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Processing...
                      </div>
                    )}
                    {stitchedVideo.status === "completed" && (
                      <div className="flex items-center gap-2 text-sm text-green-400">
                        <CheckCircle className="h-4 w-4" />
                        Ready
                      </div>
                    )}
                  </div>
                  {stitchedVideo.videoUrl && stitchedVideo.status === "completed" && (
                    <div className="relative aspect-video w-full bg-gradient-to-br from-primary/30 to-primary/10 rounded-lg overflow-hidden border border-white/20">
                      <video
                        src={stitchedVideo.videoUrl}
                        controls
                        className="w-full h-full object-cover"
                        onError={(e) => console.error("[v0] Video playback error:", e)}
                        onLoadedData={() => console.log("[v0] Stitched video loaded successfully")}
                      />
                    </div>
                  )}
                  {!stitchedVideo.videoUrl && (
                    <div className="text-sm text-white/60">Stitched video URL is missing</div>
                  )}
                  <p className="text-sm text-white/60">
                    All {items.filter((i) => i.status === "completed").length} scenes combined into one video with
                    synchronized audio
                  </p>
                </div>
              </div>
            )}

            {showStitcher && (
              <div className="backdrop-blur-xl bg-background/60 border-2 border-white/10 rounded-2xl p-6">
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-white">Stitch Videos with Audio</h2>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowStitcher(false)}
                      className="text-white/60 hover:text-white"
                    >
                      Cancel
                    </Button>
                  </div>
                  <VideoStitcher
                    videoUrls={items
                      .filter((item) => item.status === "completed" && item.videoUrl)
                      .sort((a, b) => a.timestamp - b.timestamp)
                      .map((item) => item.videoUrl!)}
                    audioUrl={audioUrl}
                    onComplete={handleStitchComplete}
                  />
                </div>
              </div>
            )}

            {isGenerating && (
              <div className="backdrop-blur-xl bg-background/60 border-2 border-white/10 rounded-2xl p-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-white">Generating music video scenes...</span>
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
              {items.map((item, index) => (
                <div key={index} className="break-inside-avoid mb-4">
                  <div className="flex flex-col gap-3 p-4 border-2 border-white/10 rounded-xl bg-background/40 backdrop-blur-xl hover:border-primary/50 transition-all shadow-lg">
                    <div className="relative aspect-video w-full bg-gradient-to-br from-primary/30 to-primary/10 rounded-lg overflow-hidden border border-white/20">
                      {item.videoUrl && item.status === "completed" ? (
                        <video
                          src={item.videoUrl}
                          controls
                          loop
                          className="w-full h-full object-cover"
                          poster={item.imageUrl}
                        />
                      ) : item.imageUrl ? (
                        <img
                          src={item.imageUrl || "/placeholder.svg"}
                          alt={item.prompt}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <div className="text-center p-4">
                            <div className="text-5xl font-bold text-white/40 mb-2">Scene {index + 1}</div>
                            <div className="text-sm font-semibold text-white/50">{formatTime(item.timestamp)}</div>
                          </div>
                        </div>
                      )}

                      <div className="absolute top-3 right-3 flex items-center gap-2 backdrop-blur-xl bg-black/50 rounded-full px-3 py-1.5 border border-white/20">
                        {getStatusIcon(item.status)}
                        <span className="text-xs font-medium text-white">{getStatusText(item.status)}</span>
                      </div>
                    </div>

                    <p className="text-sm text-white/90 leading-relaxed">{item.prompt}</p>

                    {item.error && (
                      <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2">
                        {item.error}
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs text-white/60">
                      <span>{formatTime(item.timestamp)}</span>
                      <span>{item.duration.toFixed(1)}s</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
