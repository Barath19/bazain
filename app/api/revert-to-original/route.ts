import { type NextRequest, NextResponse } from "next/server"
import { cacheGeneratedImage, getOriginalImage } from "@/lib/redis-cache"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { timestamp, prompt } = body

    if (timestamp === undefined) {
      return NextResponse.json({ error: "Missing timestamp" }, { status: 400 })
    }

    console.log(`[v0] Reverting to original image for timestamp ${timestamp}`)

    // Get the original image URL
    const originalData = await getOriginalImage(timestamp)

    if (!originalData) {
      return NextResponse.json({ error: "No original image found for this scene" }, { status: 404 })
    }

    // Restore the original image in cache
    await cacheGeneratedImage(timestamp, prompt, originalData.originalImageUrl)
    console.log(`[v0] Reverted to original image for timestamp ${timestamp}`)

    return NextResponse.json({ imageUrl: originalData.originalImageUrl })
  } catch (error) {
    console.error("[v0] Error reverting to original:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    )
  }
}
