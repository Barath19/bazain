import { type NextRequest, NextResponse } from "next/server"
import { cacheGeneratedVideo } from "@/lib/redis-cache"

export const maxDuration = 60

const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY
const RUNPOD_ENDPOINT = "https://api.runpod.ai/v2/wan-2-5/run"
const RUNPOD_STATUS_ENDPOINT = "https://api.runpod.ai/v2/wan-2-5/status"

// Enhanced prompts with camera movements for music video style
const enhancePromptWithCameraMovement = (basePrompt: string, sceneIndex: number): string => {
  const cameraMovements = [
    "Smooth tracking shot moving forward",
    "Dynamic handheld camera following the action",
    "Slow dolly zoom emphasizing the subject",
    "Cinematic crane shot rising upward",
    "Fast-paced whip pan between subjects",
    "Steady cam circling around the scene",
    "Low angle push-in shot",
    "High angle establishing shot descending",
    "Smooth slider shot moving left to right",
    "360-degree rotation around the center",
  ]

  const movement = cameraMovements[sceneIndex % cameraMovements.length]

  return `${movement}. ${basePrompt}. Professional music video cinematography, dynamic composition, smooth motion, Berlin hip-hop aesthetic with neon lighting and urban atmosphere.`
}

interface VideoPrompt {
  timestamp: number
  prompt: string
  imageUrl: string
  audioDuration: number
}

async function submitVideoJob(
  imageUrl: string,
  prompt: string,
  duration: number,
): Promise<{ jobId: string; status: string }> {
  console.log("[v0] Submitting video job with prompt:", prompt.substring(0, 100) + "...")

  const validDuration = Math.max(3, Math.min(10, Math.round(duration)))
  console.log("[v0] Using duration:", validDuration, "seconds (original:", duration, ")")

  try {
    const response = await fetch(RUNPOD_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RUNPOD_API_KEY}`,
      },
      body: JSON.stringify({
        input: {
          prompt: prompt,
          image: imageUrl,
          negative_prompt:
            "blurry, low quality, distorted, watermark, static, no movement, frozen frame, bad composition",
          size: "1280*720", // Use asterisk format as per RunPod API
          duration: validDuration,
          seed: -1,
          enable_prompt_expansion: false,
          enable_safety_checker: true,
        },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[v0] RunPod submission failed:", response.status, errorText)
      throw new Error(`RunPod submission failed: ${response.status} ${errorText}`)
    }

    const data = await response.json()
    console.log("[v0] Job submitted successfully:", data.id)
    return { jobId: data.id, status: data.status }
  } catch (error) {
    console.error("[v0] Error in submitVideoJob:", error)
    throw error
  }
}

async function pollJobStatus(jobId: string, maxAttempts = 120): Promise<string> {
  console.log("[v0] Starting to poll job:", jobId)

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 3000)) // Poll every 3 seconds for faster updates

    let retries = 3
    let lastError: Error | null = null

    while (retries > 0) {
      try {
        const response = await fetch(`${RUNPOD_STATUS_ENDPOINT}/${jobId}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${RUNPOD_API_KEY}`,
          },
          signal: AbortSignal.timeout(10000), // 10 second timeout per request
        })

        if (!response.ok) {
          const text = await response.text()
          console.error("[v0] Status check failed:", response.status, text)

          if (text.includes("Too Many Requests")) {
            console.log("[v0] Rate limited, waiting 10 seconds...")
            await new Promise((resolve) => setTimeout(resolve, 10000))
            continue
          }

          throw new Error(`Status check failed: ${response.status}`)
        }

        const data = await response.json()
        console.log(`[v0] Job ${jobId} status (attempt ${attempt}/${maxAttempts}):`, data.status)

        if (data.status === "COMPLETED") {
          const output = data.output
          console.log("[v0] Job completed, output structure:", JSON.stringify(output, null, 2))

          // Try multiple possible output structures
          const videoUrl =
            output?.result ||
            output?.video ||
            output?.video_url ||
            output?.url ||
            (Array.isArray(output?.videos) && output.videos[0]) ||
            (typeof output === "string" ? output : null)

          if (!videoUrl) {
            throw new Error(`Job completed but no video URL found in output: ${JSON.stringify(output)}`)
          }

          console.log("[v0] Video URL extracted:", videoUrl)
          return videoUrl
        }

        if (data.status === "FAILED") {
          throw new Error(`Job failed: ${data.error || "Unknown error"}`)
        }

        // If we got here, break out of retry loop (success)
        break
      } catch (error) {
        lastError = error as Error
        retries--

        if (retries > 0) {
          const backoffTime = (4 - retries) * 2000 // 2s, 4s, 6s
          console.log(`[v0] Fetch failed for job ${jobId}, retrying in ${backoffTime}ms (${retries} retries left)...`)
          await new Promise((resolve) => setTimeout(resolve, backoffTime))
        } else {
          console.error(`[v0] Error polling job ${jobId} after all retries:`, error)
          throw error
        }
      }
    }

    // If all retries failed, throw the last error
    if (lastError && retries === 0) {
      throw lastError
    }
  }

  throw new Error(`Job ${jobId} timed out after ${maxAttempts} attempts`)
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const body = await request.json()
        const { prompts, audioUrl } = body as { prompts: VideoPrompt[]; audioUrl: string }

        if (!prompts || !Array.isArray(prompts) || prompts.length === 0) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Invalid prompts array" })}\n\n`))
          controller.close()
          return
        }

        console.log("[v0] Starting video generation for", prompts.length, "scenes")

        // Process videos one by one
        for (let i = 0; i < prompts.length; i++) {
          const scene = prompts[i]

          try {
            console.log(`[v0] Processing scene ${i + 1}/${prompts.length}`)

            // Enhance prompt with camera movement
            const enhancedPrompt = enhancePromptWithCameraMovement(scene.prompt, i)

            // Mark as queued and send to client first
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  index: i,
                  timestamp: scene.timestamp,
                  status: "queued",
                })}\n\n`,
              ),
            )

            // Then cache the status
            await cacheGeneratedVideo(scene.timestamp, scene.prompt, "", scene.imageUrl, scene.audioDuration, "queued")

            // Submit job
            const { jobId } = await submitVideoJob(scene.imageUrl, enhancedPrompt, scene.audioDuration)
            console.log(`[v0] Job submitted for scene ${i + 1}, jobId:`, jobId)

            // Mark as processing and send to client first
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  index: i,
                  timestamp: scene.timestamp,
                  status: "processing",
                  jobId,
                })}\n\n`,
              ),
            )

            // Then cache the processing status
            await cacheGeneratedVideo(
              scene.timestamp,
              scene.prompt,
              "",
              scene.imageUrl,
              scene.audioDuration,
              "processing",
              jobId,
            )

            // Poll for completion
            const videoUrl = await pollJobStatus(jobId)
            console.log(`[v0] Job completed for scene ${i + 1}, videoUrl:`, videoUrl)

            // Mark as completed and send to client first
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  index: i,
                  timestamp: scene.timestamp,
                  videoUrl,
                  status: "completed",
                })}\n\n`,
              ),
            )

            // Then cache the completed video
            await cacheGeneratedVideo(
              scene.timestamp,
              scene.prompt,
              videoUrl,
              scene.imageUrl,
              scene.audioDuration,
              "completed",
              jobId,
            )

            console.log(`[v0] Scene ${i + 1} completed successfully`)
          } catch (error) {
            console.error(`[v0] Error processing scene ${i + 1}:`, error)

            const errorMessage = error instanceof Error ? error.message : "Unknown error"

            // Send error to client first
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  index: i,
                  timestamp: scene.timestamp,
                  error: errorMessage,
                  status: "failed",
                })}\n\n`,
              ),
            )

            // Then cache the failed status
            await cacheGeneratedVideo(
              scene.timestamp,
              scene.prompt,
              "",
              scene.imageUrl,
              scene.audioDuration,
              "failed",
              undefined,
              errorMessage,
            )
          }
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"))
        controller.close()
      } catch (error) {
        console.error("[v0] Stream error:", error)
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" })}\n\n`,
          ),
        )
        controller.close()
      }
    },
  })

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
