import { Redis } from "@upstash/redis"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

export interface CachedStoryboard {
  items: Array<{
    timestamp: number
    prompt: string
    duration?: number
  }>
  audioFileName: string
  audioFileUrl?: string
  cachedAt: number
}

export interface CachedImage {
  imageUrl: string
  prompt: string
  timestamp: number
  generatedAt: number
}

// Add interface for storing original images before character edits
export interface OriginalImage {
  timestamp: number
  originalImageUrl: string
  editedImageUrl: string
  savedAt: number
}

// Add interface for storing generated videos
export interface CachedVideo {
  videoUrl: string
  prompt: string
  timestamp: number
  imageUrl: string
  audioDuration: number
  generatedAt: number
  status: "queued" | "processing" | "completed" | "failed"
  jobId?: string
  error?: string
}

export interface StitchedVideo {
  videoUrl: string
  audioUrl: string
  sceneCount: number
  totalDuration: number
  stitchedAt: number
  status: "processing" | "completed" | "failed"
  error?: string
}

const STORYBOARD_KEY = "storyboard:latest"
const IMAGES_KEY_PREFIX = "storyboard:images:"
const ORIGINALS_KEY_PREFIX = "storyboard:originals:"
const VIDEOS_KEY_PREFIX = "storyboard:videos:"
const STITCHED_VIDEO_KEY = "storyboard:stitched:latest"
const CACHE_TTL = 3600 // 1 hour

export async function cacheStoryboard(data: CachedStoryboard) {
  try {
    await redis.set(STORYBOARD_KEY, data, { ex: CACHE_TTL })
    console.log("[v0] Storyboard cached successfully")
    return true
  } catch (error) {
    console.error("[v0] Error caching storyboard:", error)
    return false
  }
}

export async function getCachedStoryboard(): Promise<CachedStoryboard | null> {
  try {
    const data = await redis.get<CachedStoryboard>(STORYBOARD_KEY)
    console.log("[v0] Retrieved from Redis:", data ? "Data found" : "No data")
    return data
  } catch (error) {
    console.error("[v0] Error getting cached storyboard:", error)
    return null
  }
}

export async function clearStoryboardCache() {
  try {
    await redis.del(STORYBOARD_KEY)
    console.log("[v0] Storyboard cache cleared")
    return true
  } catch (error) {
    console.error("[v0] Error clearing cache:", error)
    return false
  }
}

export async function cacheGeneratedImages(images: CachedImage[]) {
  try {
    const key = `${IMAGES_KEY_PREFIX}latest`
    await redis.set(key, images, { ex: CACHE_TTL * 24 }) // Cache for 24 hours
    console.log("[v0] Cached", images.length, "generated images")
    return true
  } catch (error) {
    console.error("[v0] Error caching images:", error)
    return false
  }
}

export async function getCachedImages(): Promise<CachedImage[] | null> {
  try {
    const key = `${IMAGES_KEY_PREFIX}latest`
    const data = await redis.get<CachedImage[]>(key)
    console.log("[v0] Retrieved cached images:", data ? `${data.length} images` : "No images")
    return data
  } catch (error) {
    console.error("[v0] Error getting cached images:", error)
    return null
  }
}

export async function clearImageCache() {
  try {
    const key = `${IMAGES_KEY_PREFIX}latest`
    await redis.del(key)
    console.log("[v0] Image cache cleared")
    return true
  } catch (error) {
    console.error("[v0] Error clearing image cache:", error)
    return false
  }
}

export async function cacheGeneratedImage(timestamp: number, prompt: string, imageUrl: string) {
  try {
    // Get existing cached images
    const existingImages = (await getCachedImages()) || []

    // Find and update if exists, or add new
    const imageIndex = existingImages.findIndex((img) => img.timestamp === timestamp)

    const newImage: CachedImage = {
      imageUrl,
      prompt,
      timestamp,
      generatedAt: Date.now(),
    }

    if (imageIndex >= 0) {
      existingImages[imageIndex] = newImage
    } else {
      existingImages.push(newImage)
    }

    // Save back to cache
    await cacheGeneratedImages(existingImages)
    console.log("[v0] Cached single image for timestamp", timestamp)
    return true
  } catch (error) {
    console.error("[v0] Error caching single image:", error)
    return false
  }
}

// Add functions for storing original images before character edits
export async function saveOriginalImage(timestamp: number, originalUrl: string, editedUrl: string) {
  try {
    const key = `${ORIGINALS_KEY_PREFIX}${timestamp}`
    const data: OriginalImage = {
      timestamp,
      originalImageUrl: originalUrl,
      editedImageUrl: editedUrl,
      savedAt: Date.now(),
    }
    await redis.set(key, data, { ex: CACHE_TTL * 24 })
    console.log("[v0] Saved original image for timestamp", timestamp)
    return true
  } catch (error) {
    console.error("[v0] Error saving original image:", error)
    return false
  }
}

export async function getOriginalImage(timestamp: number): Promise<OriginalImage | null> {
  try {
    const key = `${ORIGINALS_KEY_PREFIX}${timestamp}`
    const data = await redis.get<OriginalImage>(key)
    return data
  } catch (error) {
    console.error("[v0] Error getting original image:", error)
    return null
  }
}

// Functions for caching generated videos
export async function cacheGeneratedVideos(videos: CachedVideo[]) {
  try {
    const key = `${VIDEOS_KEY_PREFIX}latest`
    await redis.set(key, videos, { ex: CACHE_TTL * 48 }) // Cache for 48 hours
    console.log("[v0] Cached", videos.length, "generated videos")
    return true
  } catch (error) {
    console.error("[v0] Error caching videos:", error)
    return false
  }
}

export async function getCachedVideos(): Promise<CachedVideo[] | null> {
  try {
    const key = `${VIDEOS_KEY_PREFIX}latest`
    const data = await redis.get<CachedVideo[]>(key)
    console.log("[v0] Retrieved cached videos:", data ? `${data.length} videos` : "No videos")
    return data
  } catch (error) {
    console.error("[v0] Error getting cached videos:", error)
    return null
  }
}

export async function cacheGeneratedVideo(
  timestamp: number,
  prompt: string,
  videoUrl: string,
  imageUrl: string,
  audioDuration: number,
  status: "queued" | "processing" | "completed" | "failed",
  jobId?: string,
  error?: string,
) {
  try {
    // Get existing cached videos
    const existingVideos = (await getCachedVideos()) || []

    // Find and update if exists, or add new
    const videoIndex = existingVideos.findIndex((vid) => vid.timestamp === timestamp)

    const newVideo: CachedVideo = {
      videoUrl,
      prompt,
      timestamp,
      imageUrl,
      audioDuration,
      generatedAt: Date.now(),
      status,
      jobId,
      error,
    }

    if (videoIndex >= 0) {
      existingVideos[videoIndex] = newVideo
    } else {
      existingVideos.push(newVideo)
    }

    // Save back to cache
    await cacheGeneratedVideos(existingVideos)
    console.log("[v0] Cached single video for timestamp", timestamp, "with status", status)
    return true
  } catch (error) {
    console.error("[v0] Error caching single video:", error)
    return false
  }
}

export async function clearVideoCache() {
  try {
    const key = `${VIDEOS_KEY_PREFIX}latest`
    await redis.del(key)
    console.log("[v0] Video cache cleared")
    return true
  } catch (error) {
    console.error("[v0] Error clearing video cache:", error)
    return false
  }
}

export async function cacheStitchedVideo(video: StitchedVideo) {
  try {
    const key = STITCHED_VIDEO_KEY
    await redis.set(key, video, { ex: CACHE_TTL * 48 }) // Cache for 48 hours
    console.log("[v0] Cached stitched video")
    return true
  } catch (error) {
    console.error("[v0] Error caching stitched video:", error)
    return false
  }
}

export async function getCachedStitchedVideo(): Promise<StitchedVideo | null> {
  try {
    const key = STITCHED_VIDEO_KEY
    const data = await redis.get<StitchedVideo>(key)
    console.log("[v0] Retrieved cached stitched video:", data ? "Found" : "Not found")
    return data
  } catch (error) {
    console.error("[v0] Error getting cached stitched video:", error)
    return null
  }
}

export async function clearStitchedVideoCache() {
  try {
    await redis.del(STITCHED_VIDEO_KEY)
    console.log("[v0] Stitched video cache cleared")
    return true
  } catch (error) {
    console.error("[v0] Error clearing stitched video cache:", error)
    return false
  }
}
