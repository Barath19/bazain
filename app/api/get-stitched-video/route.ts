import { NextResponse } from "next/server"
import { getCachedStitchedVideo } from "@/lib/redis-cache"

export async function GET() {
  try {
    const stitchedVideo = await getCachedStitchedVideo()

    return NextResponse.json({
      stitchedVideo: stitchedVideo || null,
    })
  } catch (error) {
    console.error("[v0] Error retrieving stitched video:", error)
    return NextResponse.json({ error: "Failed to retrieve stitched video" }, { status: 500 })
  }
}
