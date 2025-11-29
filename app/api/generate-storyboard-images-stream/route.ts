import type { NextRequest } from "next/server"
import { cacheGeneratedImages, getCachedImages, type CachedImage } from "@/lib/redis-cache"

export const runtime = "nodejs"
export const maxDuration = 60

const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY
const RUNPOD_ENDPOINT = "https://api.runpod.ai/v2/seedream-v4-t2i/run"
const RUNPOD_STATUS_ENDPOINT = "https://api.runpod.ai/v2/seedream-v4-t2i/status"

const SYSTEM_STYLE_PROMPT = `Cinematic Berlin nightlife scene, hip-hop culture aesthetic, urban street photography style. Shot on professional cinema camera with shallow depth of field. Neon lights casting vibrant colors, graffiti art on walls, moody atmospheric lighting with high contrast. Dark shadows and bright highlights, cinematic color grading with teal and orange tones. Gritty urban environment, authentic street culture, 4k ultra quality, photorealistic, professional composition.`

const NEGATIVE_PROMPT = `blurry, low quality, distorted, ugly, deformed, cartoon, anime, illustration, painting, 3d render, oversaturated, overexposed, bad anatomy, bad proportions, text, watermark, signature`

async function pollJobStatus(jobId: string, maxAttempts = 30): Promise<string | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 3000))
      }

      const response = await fetch(`${RUNPOD_STATUS_ENDPOINT}/${jobId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${RUNPOD_API_KEY}`,
        },
      })

      const contentType = response.headers.get("content-type")
      if (!response.ok || !contentType?.includes("application/json")) {
        if (response.status === 429) {
          await new Promise((resolve) => setTimeout(resolve, 5000))
        }
        continue
      }

      const data = await response.json()

      if (data.status === "COMPLETED") {
        const imageUrl =
          data.output?.result ||
          data.output?.image ||
          data.output?.images?.[0] ||
          data.output?.url ||
          (typeof data.output === "string" ? data.output : null)

        if (imageUrl) {
          return imageUrl
        } else {
          console.error(`[v0] Job ${jobId} completed but no image URL found`)
          return null
        }
      } else if (data.status === "FAILED") {
        console.error(`[v0] Job ${jobId} failed:`, data.error)
        return null
      }
    } catch (error) {
      console.error(`[v0] Error polling job ${jobId}:`, error)
      await new Promise((resolve) => setTimeout(resolve, 3000))
    }
  }

  console.error(`[v0] Job ${jobId} timed out`)
  return null
}

export async function POST(request: NextRequest) {
  let prompts
  try {
    const body = await request.json()
    prompts = body.prompts
  } catch (error) {
    return new Response(JSON.stringify({ error: "Invalid request body" }), { status: 400 })
  }

  if (!prompts || !Array.isArray(prompts)) {
    return new Response(JSON.stringify({ error: "Invalid prompts array" }), { status: 400 })
  }

  console.log("[v0] Starting streaming image generation for", prompts.length, "scenes")

  const cachedImages = await getCachedImages()
  const cachedImageMap = new Map<number, string>()

  if (cachedImages) {
    console.log("[v0] Found", cachedImages.length, "cached images")
    cachedImages.forEach((img) => {
      cachedImageMap.set(img.timestamp, img.imageUrl)
    })
  }

  const encoder = new TextEncoder()
  const generatedImages: CachedImage[] = []

  const stream = new ReadableStream({
    async start(controller) {
      for (let index = 0; index < prompts.length; index++) {
        const item = prompts[index]

        try {
          const cachedUrl = cachedImageMap.get(item.timestamp)
          if (cachedUrl) {
            console.log(`[v0] Using cached image for scene ${index + 1}`)
            const resultData = {
              index,
              timestamp: item.timestamp,
              prompt: item.prompt,
              imageUrl: cachedUrl,
              error: null,
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(resultData)}\n\n`))
            generatedImages.push({
              imageUrl: cachedUrl,
              prompt: item.prompt,
              timestamp: item.timestamp,
              generatedAt: Date.now(),
            })
            continue
          }

          const fullPrompt = `${SYSTEM_STYLE_PROMPT}\n\nScene: ${item.prompt}`

          console.log(`[v0] Processing scene ${index + 1}/${prompts.length}`)

          const response = await fetch(RUNPOD_ENDPOINT, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${RUNPOD_API_KEY}`,
            },
            body: JSON.stringify({
              input: {
                prompt: fullPrompt,
                negative_prompt: NEGATIVE_PROMPT,
                size: "2048*2048",
                seed: -1,
                enable_safety_checker: true,
              },
              gpuIds: "NVIDIA RTX A5000",
            }),
          })

          if (!response.ok) {
            const errorText = await response.text()
            console.error(`[v0] RunPod API error for scene ${index + 1}:`, errorText)

            const errorData = {
              index,
              timestamp: item.timestamp,
              prompt: item.prompt,
              imageUrl: null,
              error: `RunPod API error: ${errorText}`,
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`))
            continue
          }

          const data = await response.json()
          const jobId = data.id

          if (!jobId) {
            const errorData = {
              index,
              timestamp: item.timestamp,
              prompt: item.prompt,
              imageUrl: null,
              error: "No job ID in response",
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`))
            continue
          }

          console.log(`[v0] Job created: ${jobId}, polling for completion...`)

          const imageUrl = await pollJobStatus(jobId)

          const resultData = {
            index,
            timestamp: item.timestamp,
            prompt: item.prompt,
            imageUrl: imageUrl,
            error: imageUrl ? null : "Failed to generate image",
          }

          if (imageUrl) {
            generatedImages.push({
              imageUrl,
              prompt: item.prompt,
              timestamp: item.timestamp,
              generatedAt: Date.now(),
            })
          }

          console.log(`[v0] Scene ${index + 1} completed, streaming result`)
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(resultData)}\n\n`))

          if (index < prompts.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 1000))
          }
        } catch (error) {
          console.error(`[v0] Error for scene ${index + 1}:`, error)
          const errorData = {
            index,
            timestamp: item.timestamp,
            prompt: item.prompt,
            imageUrl: null,
            error: error instanceof Error ? error.message : "Unknown error",
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`))
        }
      }

      if (generatedImages.length > 0) {
        await cacheGeneratedImages(generatedImages)
      }

      controller.enqueue(encoder.encode("data: [DONE]\n\n"))
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
