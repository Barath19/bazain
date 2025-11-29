import { type NextRequest, NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { cacheGeneratedImage, saveOriginalImage } from "@/lib/redis-cache"

const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY
const RUNPOD_ENDPOINT = "https://api.runpod.ai/v2/seedream-v4-edit/run"

export const maxDuration = 60
export const dynamic = "force-dynamic"

async function pollJobStatus(jobId: string, maxAttempts = 30): Promise<any> {
  const statusUrl = `https://api.runpod.ai/v2/seedream-v4-edit/status/${jobId}`

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`[v0] Polling job ${jobId}, attempt ${attempt}/${maxAttempts}`)

    try {
      const response = await fetch(statusUrl, {
        headers: {
          Authorization: `Bearer ${RUNPOD_API_KEY}`,
        },
      })

      if (!response.ok) {
        const text = await response.text()
        console.error(`[v0] Status check failed: ${response.status} ${text}`)

        if (response.status === 429) {
          console.log("[v0] Rate limited, waiting 5 seconds...")
          await new Promise((resolve) => setTimeout(resolve, 5000))
          continue
        }

        throw new Error(`Status check failed: ${response.status}`)
      }

      const data = await response.json()
      console.log(`[v0] Job ${jobId} status:`, data.status)

      if (data.status === "COMPLETED") {
        console.log("[v0] Job completed, output:", JSON.stringify(data.output))

        const imageUrl =
          data.output?.result ||
          data.output?.image ||
          data.output?.images?.[0] ||
          data.output?.url ||
          (typeof data.output === "string" ? data.output : null)

        if (imageUrl) {
          return imageUrl
        } else {
          console.error("[v0] Job completed but no image URL found in output:", data.output)
          throw new Error("Job completed but no image URL found")
        }
      }

      if (data.status === "FAILED") {
        throw new Error(`Job failed: ${data.error || "Unknown error"}`)
      }

      await new Promise((resolve) => setTimeout(resolve, 3000))
    } catch (error) {
      console.error(`[v0] Error polling job ${jobId}:`, error)
      if (attempt === maxAttempts) {
        throw error
      }
    }
  }

  throw new Error(`Job ${jobId} timed out after ${maxAttempts} attempts`)
}

async function uploadCharacterImage(base64DataUrl: string): Promise<string> {
  try {
    console.log("[v0] Uploading character image to Vercel Blob...")

    // Extract base64 data from data URL
    const matches = base64DataUrl.match(/^data:([A-Za-z-+/]+);base64,(.+)$/)
    if (!matches || matches.length !== 3) {
      throw new Error("Invalid base64 data URL")
    }

    const mimeType = matches[1]
    const base64Data = matches[2]

    // Convert base64 to buffer
    const buffer = Buffer.from(base64Data, "base64")

    // Create a Blob from the buffer
    const blob = new Blob([buffer], { type: mimeType })

    // Upload to Vercel Blob
    const uploadResult = await put(`character-${Date.now()}.jpg`, blob, {
      access: "public",
      contentType: mimeType,
    })

    console.log(`[v0] Uploaded character image to: ${uploadResult.url}`)
    return uploadResult.url
  } catch (error) {
    console.error("[v0] Error uploading character image:", error)
    throw error
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sceneImageUrl, characterImageBase64, prompt, timestamp } = body

    if (!sceneImageUrl || !characterImageBase64 || !prompt) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    console.log(`[v0] Regenerating scene with character for timestamp ${timestamp}`)

    // Upload character image to get public URL
    const characterImageUrl = await uploadCharacterImage(characterImageBase64)

    const blendPrompt = `Seamlessly blend the person from the second image into the Berlin nightlife scene from the first image. ${prompt} The person should appear naturally integrated with proper lighting matching the neon-lit environment, correct perspective and scale, realistic shadows and reflections, and consistent with the moody cinematic atmosphere of the Berlin street scene. Make it look like they were originally part of this photo.`

    console.log(`[v0] Submitting job to RunPod with scene + character images`)

    const runpodResponse = await fetch(RUNPOD_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RUNPOD_API_KEY}`,
      },
      body: JSON.stringify({
        input: {
          prompt: blendPrompt,
          images: [sceneImageUrl, characterImageUrl],
          size: "1024x1024",
          enable_safety_checker: true,
        },
      }),
    })

    if (!runpodResponse.ok) {
      const errorText = await runpodResponse.text()
      console.error(`[v0] RunPod API error: ${runpodResponse.status} ${errorText}`)
      throw new Error(`RunPod API error: ${runpodResponse.status}`)
    }

    const jobData = await runpodResponse.json()
    console.log(`[v0] Job created:`, jobData.id)

    // Poll for completion
    const imageUrl = await pollJobStatus(jobData.id)

    // Save original image for revert capability
    await saveOriginalImage(timestamp, sceneImageUrl, imageUrl)
    console.log(`[v0] Saved original image for revert capability`)

    // Cache the new edited image
    await cacheGeneratedImage(timestamp, prompt, imageUrl)
    console.log(`[v0] Cached character-edited image for timestamp ${timestamp}`)

    return NextResponse.json({ imageUrl })
  } catch (error) {
    console.error("[v0] Error regenerating with character:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    )
  }
}
