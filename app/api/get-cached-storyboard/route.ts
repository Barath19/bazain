import { type NextRequest, NextResponse } from "next/server"
import { getCachedStoryboard } from "@/lib/redis-cache"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  try {
    const cached = await getCachedStoryboard()

    if (!cached) {
      return NextResponse.json({ cached: false })
    }

    return NextResponse.json({ cached: true, data: cached })
  } catch (error) {
    console.error("[v0] Error in get-cached-storyboard API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
