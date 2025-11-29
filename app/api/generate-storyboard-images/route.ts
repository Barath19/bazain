import { type NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 60

const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY
const RUNPOD_ENDPOINT = "https://api.runpod.ai/v2/seedream-v4-t2i/run"
const RUNPOD_STATUS_ENDPOINT = "https://api.runpod.ai/v2/seedream-v4-t2i/status"

async function pollJobStatus(jobId: string, maxAttempts = 30): Promise<string | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 3000)) // 3 seconds between polls
      }

      const response = await fetch(`${RUNPOD_STATUS_ENDPOINT}/${jobId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${RUNPOD_API_KEY}`,
        },
      })

      const contentType = response.headers.get("content-type")
      if (!response.ok || !contentType?.includes("application/json")) {
        const text = await response.text()
        console.error(`[v0] Status check failed for ${jobId}:`, response.status, text)

        // If rate limited, wait longer before retry
        if (response.status === 429 || text.includes("Too Many")) {
          await new Promise((resolve) => setTimeout(resolve, 5000))
        }
        continue
      }

      const data = await response.json()
      console.log(`[v0] Job ${jobId} status (attempt ${attempt + 1}):`, data.status)

      if (data.status === "COMPLETED") {
        // Log the full output structure for debugging
        console.log(`[v0] Job ${jobId} output structure:`, JSON.stringify(data.output))

        const imageUrl =
          data.output?.result ||
          data.output?.image ||
          data.output?.images?.[0] ||
          data.output?.url ||
          (typeof data.output === "string" ? data.output : null)

        if (imageUrl) {
          console.log(`[v0] Job ${jobId} completed successfully with image URL`)
          return imageUrl
        } else {
          console.error(`[v0] Job ${jobId} completed but no image URL found in output:`, data.output)
          return null
        }
      } else if (data.status === "FAILED") {
        console.error(`[v0] Job ${jobId} failed:`, data.error)
        return null
      }
      // Continue polling for IN_PROGRESS or IN_QUEUE status
    } catch (error) {
      console.error(`[v0] Error polling job ${jobId}:`, error)
      await new Promise((resolve) => setTimeout(resolve, 3000))
    }
  }

  console.error(`[v0] Job ${jobId} timed out after ${maxAttempts} attempts`)
  return null
}

export async function POST(request: NextRequest) {
  let prompts
  try {
    const body = await request.json()
    prompts = body.prompts
  } catch (error) {
    console.error("[v0] Failed to parse request body:", error)
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  if (!prompts || !Array.isArray(prompts)) {
    return NextResponse.json({ error: "Invalid prompts array" }, { status: 400 })
  }

  console.log("[v0] Generating images for", prompts.length, "scenes using RunPod Seedream v4")

  const images = []

  for (let index = 0; index < prompts.length; index++) {
    const item = prompts[index]

    try {
      const enhancedPrompt = `${item.prompt}, Berlin nightlife, hip-hop culture, urban street photography, neon lights, graffiti art, moody atmosphere, cinematic lighting, 4k quality, professional photography`

      console.log(`[v0] Processing scene ${index + 1}/${prompts.length} at ${item.timestamp}s`)

      const requestBody = {
        input: {
          prompt: enhancedPrompt,
          negative_prompt: "blurry, low quality, distorted, ugly",
          size: "2048*2048",
          seed: -1,
          enable_safety_checker: true,
        },
      }

      // Submit the job
      const response = await fetch(RUNPOD_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RUNPOD_API_KEY}`,
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`[v0] RunPod API error for scene ${index + 1}:`, errorText)
        images.push({
          timestamp: item.timestamp,
          prompt: item.prompt,
          imageUrl: null,
          error: `RunPod API error: ${errorText}`,
        })
        continue
      }

      const data = await response.json()
      const jobId = data.id

      if (!jobId) {
        images.push({
          timestamp: item.timestamp,
          prompt: item.prompt,
          imageUrl: null,
          error: "No job ID in response",
        })
        continue
      }

      console.log(`[v0] Job created for scene ${index + 1}: ${jobId}`)

      const imageUrl = await pollJobStatus(jobId)

      images.push({
        timestamp: item.timestamp,
        prompt: item.prompt,
        imageUrl: imageUrl,
        error: imageUrl ? null : "Failed to generate image",
      })

      if (index < prompts.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    } catch (error) {
      console.error(`[v0] Error generating image for scene ${index + 1}:`, error)
      images.push({
        timestamp: item.timestamp,
        prompt: item.prompt,
        imageUrl: null,
        error: error instanceof Error ? error.message : "Unknown error",
      })
    }
  }

  const successCount = images.filter((img) => img.imageUrl).length
  console.log(`[v0] Image generation completed: ${successCount}/${images.length} successful`)

  return NextResponse.json({ images })
}
