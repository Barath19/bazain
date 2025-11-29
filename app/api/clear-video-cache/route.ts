import { NextResponse } from "next/server"
import { clearVideoCache } from "@/lib/redis-cache"

export async function POST() {
  try {
    await clearVideoCache()
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Error clearing video cache:", error)
    return NextResponse.json({ success: false, error: "Failed to clear video cache" }, { status: 500 })
  }
}
