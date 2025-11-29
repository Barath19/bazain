import { generateText } from "ai"

export async function POST(request: Request) {
  try {
    const { frames } = (await request.json()) as {
      frames: Array<{ timestamp: number; frameData: string }>
    }

    const prompts: Array<{ timestamp: number; prompt: string }> = []

    // Process each frame with OpenAI Vision
    for (const frame of frames) {
      const { text } = await generateText({
        model: "openai/gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Describe this video frame in detail. Focus on the mood, colors, composition, and any notable elements. Keep it concise but descriptive (2-3 sentences).",
              },
              {
                type: "image",
                image: frame.frameData,
              },
            ],
          },
        ],
      })

      prompts.push({
        timestamp: frame.timestamp,
        prompt: text,
      })
    }

    return Response.json({ prompts })
  } catch (error) {
    console.error("[v0] Error analyzing frames:", error)
    return Response.json({ error: "Failed to analyze frames" }, { status: 500 })
  }
}
