import { getCachedImages } from "@/lib/redis-cache"

export const runtime = "nodejs"

export async function GET() {
  try {
    const images = await getCachedImages()

    if (images && images.length > 0) {
      return Response.json({
        cached: true,
        images,
      })
    }

    return Response.json({
      cached: false,
      images: [],
    })
  } catch (error) {
    console.error("[v0] Error getting cached images:", error)
    return Response.json({ cached: false, images: [], error: "Failed to get cached images" }, { status: 500 })
  }
}
