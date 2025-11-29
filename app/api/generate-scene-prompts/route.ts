import { type NextRequest, NextResponse } from "next/server"
import { generateText } from "ai"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const { audioCharacteristics, audioName } = await request.json()

    if (!audioCharacteristics || !audioCharacteristics.beats) {
      return NextResponse.json({ error: "Missing audio characteristics data" }, { status: 400 })
    }

    // Check for OpenAI API key
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: "OpenAI API key not configured. Please add OPENAI_API_KEY to your environment variables." },
        { status: 500 },
      )
    }

    const { tempo, overallEnergy, duration, beats } = audioCharacteristics

    console.log(`[v0] Generating scene prompts for ${beats.length} beats`)

    const energyLevel = overallEnergy > 0.7 ? "high energy" : overallEnergy > 0.4 ? "moderate energy" : "calm"
    const tempoDescription = tempo > 140 ? "fast-paced" : tempo > 100 ? "upbeat" : tempo > 80 ? "mid-tempo" : "slow"

    // Create beat descriptions with energy levels
    const beatDescriptions = beats
      .map((beat: any, index: number) => {
        const energyDesc = beat.energy > 0.7 ? "intense" : beat.energy > 0.4 ? "moderate" : "soft"
        const bassDesc =
          beat.bassPresence > 0.6 ? "bass-heavy" : beat.bassPresence > 0.4 ? "balanced" : "treble-focused"
        return `Beat ${index + 1} at ${beat.time.toFixed(2)}s: ${energyDesc}, ${bassDesc}`
      })
      .join("\n")

    const response = await generateText({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are a creative music video director specializing in Berlin hip-hop culture and nightlife. You capture the raw, underground energy of Berlin streets, iconic monuments, and the city's legendary party scene. Your visuals blend urban grit with cultural landmarks, creating authentic Berlin atmosphere.",
        },
        {
          role: "user",
          content: `Create a Berlin hip-hop nightlife music video for "${audioName}" with these audio characteristics:
- Tempo: ${tempo} BPM (${tempoDescription})
- Overall Energy: ${(overallEnergy * 100).toFixed(0)}% (${energyLevel})
- Duration: ${duration.toFixed(1)}s
- Total Beats: ${beats.length}

Beat Analysis:
${beatDescriptions}

THEME: Hip-hop nightlife Berlin party scene - low-key streets of Berlin and Berlin monuments

Generate a visually striking scene description for each beat that:
1. Takes place in Berlin locations (streets, clubs, landmarks like Brandenburg Gate, TV Tower, East Side Gallery, Berghain area, Kreuzberg neighborhoods)
2. Captures the low-key, underground hip-hop aesthetic
3. Features nightlife elements (neon lights, graffiti, club scenes, street culture)
4. Matches energy levels: intense beats = dynamic street action or club energy, soft beats = moody street corners or monument silhouettes
5. Reflects the tempo: fast = quick cuts between locations, slow = lingering atmospheric shots
6. Uses bass-heavy beats for powerful monument reveals or crowd energy
7. Creates authentic Berlin hip-hop atmosphere throughout

Keep descriptions concise but evocative. Focus on visual details, lighting, and Berlin-specific locations.

Format as JSON array: [{"timestamp": 0.5, "prompt": "description"}, ...]`,
        },
      ],
    })

    const { text } = response

    // Parse the AI response
    let prompts: Array<{ timestamp: number; prompt: string }> = []
    try {
      // Extract JSON from the response
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        prompts = JSON.parse(jsonMatch[0])
      } else {
        prompts = JSON.parse(text)
      }
    } catch (parseError) {
      console.error("[v0] Failed to parse AI response:", parseError)
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 })
    }

    console.log(`[v0] Generated ${prompts.length} scene prompts`)

    return NextResponse.json({ prompts })
  } catch (error) {
    console.error("[v0] Error generating scene prompts:", error)
    return NextResponse.json({ error: "Failed to generate scene prompts" }, { status: 500 })
  }
}
