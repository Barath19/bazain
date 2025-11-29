import { type NextRequest, NextResponse } from "next/server"
import { cacheStoryboard, clearStoryboardCache, type CachedStoryboard } from "@/lib/redis-cache"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  try {
    const data = (await req.json()) as CachedStoryboard

    const success = await cacheStoryboard(data)

    if (!success) {
      return NextResponse.json({ error: "Failed to cache storyboard" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Error in cache-storyboard API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const success = await clearStoryboardCache()

    if (!success) {
      return NextResponse.json({ error: "Failed to clear cache" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Error in clear cache API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
