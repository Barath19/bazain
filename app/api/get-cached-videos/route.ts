import { NextResponse } from "next/server"
import { getCachedVideos } from "@/lib/redis-cache"

export async function GET() {
  try {
    const videos = await getCachedVideos()

    if (videos && videos.length > 0) {
      return NextResponse.json({
        cached: true,
        videos,
      })
    }

    return NextResponse.json({
      cached: false,
      videos: [],
    })
  } catch (error) {
    console.error("[v0] Error getting cached videos:", error)
    return NextResponse.json(
      {
        cached: false,
        error: "Failed to get cached videos",
      },
      { status: 500 },
    )
  }
}
