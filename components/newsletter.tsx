"use client"

import type React from "react"

import { useEffect, useRef, useState } from "react"
import { Button, buttonVariants } from "./ui/button"
import { FormNewsletter } from "./form-newsletter"
import { AnimatePresence, motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { ArrowRightIcon, Cross1Icon, UploadIcon } from "@radix-ui/react-icons"
import { inputVariants } from "./ui/input"
import { useIsV0 } from "@/lib/context"
import { AudioVideoEditor } from "./audio-video-editor"

const DURATION = 0.3
const DELAY = DURATION
const EASE_OUT = "easeOut"
const EASE_OUT_OPACITY = [0.25, 0.46, 0.45, 0.94] as const
const SPRING = {
  type: "spring" as const,
  stiffness: 60,
  damping: 10,
  mass: 0.8,
}

export const Newsletter = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [showEditor, setShowEditor] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isInitialRender = useRef(true)

  useEffect(() => {
    return () => {
      isInitialRender.current = false
    }
  }, [isOpen])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false)
        setShowEditor(false)
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files.length > 0) {
      const file = files[0]
      if (file.type.startsWith("audio/")) {
        setAudioFile(file)
        setShowEditor(true)
      }
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      setAudioFile(files[0])
      setShowEditor(true)
    }
  }

  const handleRemoveFile = () => {
    setAudioFile(null)
    setShowEditor(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  return (
    <div className="flex overflow-hidden relative flex-col gap-4 justify-center items-center pt-10 w-full h-full short:lg:pt-10 pb-footer-safe-area 2xl:pt-footer-safe-area px-sides short:lg:gap-4 lg:gap-8">
      <motion.div layout="position" transition={{ duration: DURATION, ease: EASE_OUT }}>
        <h1 className="text-5xl italic short:lg:text-8xl sm:text-8xl lg:text-9xl text-foreground font-serif">
          Framelab
        </h1>
      </motion.div>

      <div className="flex flex-col items-center min-h-0 shrink">
        <AnimatePresenceGuard>
          {!isOpen && (
            <motion.div
              key="newsletter"
              initial={isInitialRender.current ? false : "hidden"}
              animate="visible"
              exit="exit"
              variants={{
                visible: {
                  scale: 1,
                  transition: {
                    delay: DELAY,
                    duration: DURATION,
                    ease: EASE_OUT,
                  },
                },
                hidden: {
                  scale: 0.9,
                  transition: { duration: DURATION, ease: EASE_OUT },
                },
                exit: {
                  y: -150,
                  scale: 0.9,
                  transition: { duration: DURATION, ease: EASE_OUT },
                },
              }}
            >
              <div className="flex flex-col gap-4 w-full max-w-xl md:gap-6 lg:gap-8">
                <FormNewsletter
                  input={(props) => (
                    /* @ts-expect-error - Type mismatch */
                    <motion.input
                      autoCapitalize="off"
                      autoComplete="email"
                      placeholder="Generate your music video"
                      className={inputVariants()}
                      initial={isInitialRender.current ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{
                        opacity: 0,
                        transition: {
                          duration: DURATION,
                          ease: EASE_OUT_OPACITY,
                        },
                      }}
                      transition={{
                        duration: DURATION,
                        ease: EASE_OUT,
                        delay: DELAY,
                      }}
                      {...props}
                    />
                  )}
                  submit={(props) => (
                    /* @ts-expect-error - Type mismatch */
                    <motion.button
                      className={buttonVariants({
                        variant: "iconButton",
                        size: "icon-xl",
                      })}
                      {...props}
                      initial={isInitialRender.current ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{
                        opacity: 0,
                        transition: {
                          duration: DURATION,
                          ease: EASE_OUT_OPACITY,
                        },
                      }}
                      transition={{
                        duration: DURATION,
                        ease: EASE_OUT,
                        delay: DELAY,
                      }}
                    >
                      <ArrowRightIcon className="w-4 h-4 text-current" />
                    </motion.button>
                  )}
                />
                <motion.p
                  initial={isInitialRender.current ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{
                    opacity: 0,
                    transition: { duration: DURATION, ease: EASE_OUT_OPACITY },
                  }}
                  transition={{
                    duration: DURATION,
                    ease: EASE_OUT,
                    delay: DELAY,
                  }}
                  className="text-base short:lg:text-lg sm:text-lg lg:text-xl !leading-[1.1] font-medium text-center text-foreground text-pretty"
                >
                  Stay updated with the latest news and exclusive content! Subscribe to our newsletter today and never
                  miss out on exciting updates.
                </motion.p>
              </div>
            </motion.div>
          )}

          <motion.div layout="position" transition={SPRING} key="button" className={isOpen ? "my-6" : "mt-6"}>
            <Button className={cn("relative px-8")} onClick={() => setIsOpen(!isOpen)} shine={!isOpen}>
              <motion.span
                animate={{ x: isOpen ? -16 : 0 }}
                transition={{ duration: DURATION, ease: EASE_OUT }}
                className="inline-block"
              >
                Upload Audio
              </motion.span>

              {isOpen && (
                <motion.div
                  className={cn(
                    buttonVariants({ variant: "iconButton", size: "icon" }),
                    "absolute -top-px -right-px aspect-square",
                  )}
                  initial={{ opacity: 0, scale: 0.8, rotate: -40 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  transition={{
                    duration: DURATION,
                    ease: EASE_OUT,
                    delay: DELAY,
                  }}
                >
                  <Cross1Icon className="size-5 text-primary-foreground" />
                </motion.div>
              )}
            </Button>
          </motion.div>

          {isOpen && (
            <motion.div
              key="audio-upload"
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={{
                visible: {
                  opacity: 1,
                  scale: 1,
                  transition: {
                    delay: DELAY,
                    duration: DURATION,
                    ease: EASE_OUT,
                  },
                },
                hidden: {
                  opacity: 0,
                  scale: 0.9,
                  transition: { duration: DURATION, ease: EASE_OUT },
                },
                exit: {
                  opacity: 0,
                  scale: 0.9,
                  transition: { duration: DURATION, ease: EASE_OUT_OPACITY },
                },
              }}
              className="relative flex min-h-0 flex-shrink overflow-hidden text-sm md:text-base max-h-[calc(70dvh-var(--footer-safe-area))] flex-col gap-8 text-center backdrop-blur-xl text-balance border-2 border-border/50 bg-primary/20 max-w-3xl text-foreground rounded-3xl ring-1 ring-offset-primary/10 ring-border/10 ring-offset-2 shadow-button"
            >
              <div className="relative p-6 h-full flex flex-col overflow-y-auto">
                <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleFileSelect} className="hidden" />

                {!audioFile ? (
                  <div className="flex items-center justify-center h-full">
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={cn(
                        "flex flex-col items-center justify-center gap-4 p-12 w-full h-64 border-2 border-dashed rounded-2xl cursor-pointer transition-colors",
                        isDragging
                          ? "border-primary bg-primary/10"
                          : "border-border/50 hover:border-primary/50 hover:bg-primary/5",
                      )}
                    >
                      <UploadIcon className="size-12 text-foreground/50" />
                      <div className="flex flex-col gap-2">
                        <p className="text-lg font-medium text-foreground">
                          {isDragging ? "Drop your audio file here" : "Drag and drop your audio file"}
                        </p>
                        <p className="text-sm text-foreground/60">or click to browse</p>
                        <p className="text-xs text-foreground/40 italic">Supports MP3, WAV, OGG, and more</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-6 w-full">
                    {!showEditor ? (
                      <>
                        <div className="flex flex-col items-center gap-4 p-8 w-full border-2 border-border/50 rounded-2xl bg-primary/5">
                          <div className="flex items-center justify-center size-16 rounded-full bg-primary/20">
                            <UploadIcon className="size-8 text-primary" />
                          </div>
                          <div className="flex flex-col gap-1 text-center">
                            <p className="text-lg font-medium text-foreground break-all px-4">{audioFile.name}</p>
                            <p className="text-sm text-foreground/60">{(audioFile.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                          <audio controls className="w-full max-w-md mt-2" src={URL.createObjectURL(audioFile)} />
                        </div>
                        <div className="flex gap-3 justify-center">
                          <Button variant="outline" onClick={handleRemoveFile} className="px-6 bg-transparent">
                            Remove
                          </Button>
                          <Button onClick={() => fileInputRef.current?.click()} className="px-6">
                            Choose Different File
                          </Button>
                        </div>
                      </>
                    ) : (
                      <AudioVideoEditor audioFile={audioFile} videoUrl="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/alt-g7Cv2QzqL3k6ey3igjNYkM32d8Fld7.mp4" />
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresenceGuard>
      </div>
    </div>
  )
}

const AnimatePresenceGuard = ({ children }: { children: React.ReactNode }) => {
  const isV0 = useIsV0()

  return isV0 ? (
    <>{children}</>
  ) : (
    <AnimatePresence mode="popLayout" propagate>
      {children}
    </AnimatePresence>
  )
}
