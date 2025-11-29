"use client"

import { useState } from "react"
import { Button } from "./ui/button"
import { Textarea } from "./ui/textarea"
import { formatTime } from "@/lib/audio-analysis"

interface TimelineItem {
  timestamp: number
  prompt: string
}

interface TimelineEditorProps {
  items: TimelineItem[]
  onPromptChange: (timestamp: number, newPrompt: string) => void
  onRegeneratePrompt: (timestamp: number) => void
  isRegenerating?: boolean
}

export function TimelineEditor({ items, onPromptChange, onRegeneratePrompt, isRegenerating }: TimelineEditorProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)

  return (
    <div className="flex flex-col gap-4 max-h-96 overflow-y-auto p-4">
      {items.map((item, index) => (
        <div
          key={item.timestamp}
          className="flex flex-col gap-3 p-4 border-2 border-border/50 rounded-xl bg-primary/5 hover:bg-primary/10 transition-colors"
        >
          <div className="flex items-start gap-4">
            <div className="flex-1 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-mono font-medium text-foreground">{formatTime(item.timestamp)}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExpandedIndex(expandedIndex === index ? null : index)}
                  className="text-xs"
                >
                  {expandedIndex === index ? "Collapse" : "Edit"}
                </Button>
              </div>
              {expandedIndex === index ? (
                <div className="flex flex-col gap-2">
                  <Textarea
                    value={item.prompt}
                    onChange={(e) => onPromptChange(item.timestamp, e.target.value)}
                    className="min-h-24 text-sm"
                    placeholder="Scene description..."
                  />
                </div>
              ) : (
                <p className="text-sm text-foreground/70 line-clamp-3">{item.prompt}</p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
