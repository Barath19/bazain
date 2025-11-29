import { clearImageCache } from "@/lib/redis-cache"

export const runtime = "nodejs"

export async function POST() {
  try {
    await clearImageCache()
    return Response.json({ success: true, message: "Image cache cleared" })
  } catch (error) {
    console.error("[v0] Error clearing image cache:", error)
    return Response.json({ success: false, error: "Failed to clear cache" }, { status: 500 })
  }
}
