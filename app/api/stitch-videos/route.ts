import { type NextRequest, NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { cacheStitchedVideo } from "@/lib/redis-cache"

export const maxDuration = 300 // 5 minutes for video processing

interface StitchVideoRequest {
  videoUrls: string[]
  audioUrl: string
  outputFilename: string
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as StitchVideoRequest
    const { videoUrls, audioUrl, outputFilename } = body

    if (!videoUrls || videoUrls.length === 0) {
      return NextResponse.json({ error: "No video URLs provided" }, { status: 400 })
    }

    if (!audioUrl) {
      return NextResponse.json({ error: "No audio URL provided" }, { status: 400 })
    }

    console.log("[v0] Stitching", videoUrls.length, "videos together with audio")

    // Download all videos
    const videoBuffers = await Promise.all(
      videoUrls.map(async (url) => {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`Failed to fetch video: ${url}`)
        return await response.arrayBuffer()
      }),
    )

    // Download audio
    const audioResponse = await fetch(audioUrl)
    if (!audioResponse.ok) throw new Error("Failed to fetch audio")
    const audioBuffer = await audioResponse.arrayBuffer()

    console.log(
      "[v0] Downloaded",
      videoBuffers.length,
      "videos (",
      Math.round(videoBuffers.reduce((sum, buf) => sum + buf.byteLength, 0) / 1024 / 1024),
      "MB) and audio (",
      Math.round(audioBuffer.byteLength / 1024 / 1024),
      "MB)",
    )

    // Create metadata for client-side stitching
    const metadata = {
      videoCount: videoUrls.length,
      videoUrls,
      audioUrl,
      outputFilename,
      totalSize: Math.round(
        (videoBuffers.reduce((sum, buf) => sum + buf.byteLength, 0) + audioBuffer.byteLength) / 1024 / 1024,
      ),
      instruction:
        "Video stitching will be handled client-side using web APIs. The render page will combine these videos automatically.",
    }

    const metadataBlob = new Blob([JSON.stringify(metadata, null, 2)], { type: "application/json" })

    const uploadedMetadata = await put(`metadata/stitch-${Date.now()}.json`, metadataBlob, {
      access: "public",
      contentType: "application/json",
    })

    // Cache as completed with metadata
    await cacheStitchedVideo({
      videoUrl: uploadedMetadata.url,
      metadata: metadata,
      status: "completed",
      createdAt: Date.now(),
    })

    console.log("[v0] Metadata cached, ready for client-side stitching")

    return NextResponse.json({
      success: true,
      metadataUrl: uploadedMetadata.url,
      videoUrls,
      audioUrl,
      videoCount: videoUrls.length,
      message: "Video metadata prepared. Videos will be stitched client-side.",
    })
  } catch (error) {
    console.error("[v0] Error preparing videos:", error)
    return NextResponse.json(
      { error: "Failed to prepare videos: " + (error instanceof Error ? error.message : "Unknown error") },
      { status: 500 },
    )
  }
}
