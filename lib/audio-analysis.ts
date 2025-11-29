export interface BeatTimestamp {
  time: number
  amplitude: number
  confidence: number
}

export interface AudioCharacteristics {
  tempo: number // BPM
  overallEnergy: number // 0-1
  duration: number
  beats: Array<{
    time: number
    energy: number // relative energy at this beat
    bassPresence: number // 0-1
    highFreqPresence: number // 0-1
  }>
}

export async function analyzeBeatTimestamps(audioFile: File, sensitivity = 1.0): Promise<BeatTimestamp[]> {
  console.log("[v0] Starting beat analysis with sensitivity:", sensitivity)

  const audioContext = new AudioContext()
  const arrayBuffer = await audioFile.arrayBuffer()
  console.log("[v0] Audio file loaded, decoding...")

  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
  console.log("[v0] Audio decoded, analyzing beats...")

  const channelData = audioBuffer.getChannelData(0)
  const sampleRate = audioBuffer.sampleRate

  const offlineContext = new OfflineAudioContext(1, audioBuffer.length, sampleRate)
  const source = offlineContext.createBufferSource()
  source.buffer = audioBuffer

  const analyser = offlineContext.createAnalyser()
  analyser.fftSize = 2048
  analyser.smoothingTimeConstant = 0.8

  source.connect(analyser)
  source.start(0)

  // Simplified beat detection using energy in low frequency bands
  const beats: BeatTimestamp[] = []
  const bufferLength = analyser.frequencyBinCount
  const dataArray = new Uint8Array(bufferLength)

  // Sample every 100ms for performance
  const sampleInterval = 0.1 // seconds
  const samplesPerInterval = sampleInterval * sampleRate
  const totalSamples = Math.floor(audioBuffer.duration / sampleInterval)

  const energyHistory: number[] = []
  const C = 1.3 + sensitivity * 0.3 // Threshold constant: sensitivity ranges from 0-2, making C range from 1.3-1.9
  const historySize = 43 // ~4.3 seconds of history
  const minTimeBetweenBeats = 1.0 + sensitivity * 0.5 // Ranges from 1.0s to 2.0s

  console.log("[v0] Processing", totalSamples, "samples with min beat interval:", minTimeBetweenBeats, "seconds")

  for (let i = 0; i < totalSamples; i++) {
    const startSample = Math.floor(i * samplesPerInterval)
    const endSample = Math.min(startSample + analyser.fftSize, channelData.length)

    // Calculate energy in low frequency range (bass)
    let energy = 0
    for (let j = startSample; j < endSample; j++) {
      energy += channelData[j] * channelData[j]
    }
    energy = energy / (endSample - startSample)

    energyHistory.push(energy)

    // Keep only recent history
    if (energyHistory.length > historySize) {
      energyHistory.shift()
    }

    // Calculate average energy from history
    const avgEnergy = energyHistory.reduce((a, b) => a + b, 0) / energyHistory.length

    // Detect beat if current energy exceeds threshold
    if (energy > C * avgEnergy && energyHistory.length >= 10) {
      const time = i * sampleInterval

      if (beats.length === 0 || time - beats[beats.length - 1].time > minTimeBetweenBeats) {
        beats.push({
          time,
          amplitude: energy,
          confidence: Math.min(1.0, energy / (C * avgEnergy)),
        })
      }
    }
  }

  console.log("[v0] Beat analysis complete:", beats.length, "beats detected")
  await audioContext.close()

  return beats
}

export async function analyzeAudioCharacteristics(
  audioFile: File,
  beats: BeatTimestamp[],
): Promise<AudioCharacteristics> {
  console.log("[v0] Analyzing audio characteristics...")

  const audioContext = new AudioContext()
  const arrayBuffer = await audioFile.arrayBuffer()
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

  const channelData = audioBuffer.getChannelData(0)
  const sampleRate = audioBuffer.sampleRate
  const duration = audioBuffer.duration

  // Calculate overall energy
  let totalEnergy = 0
  for (let i = 0; i < channelData.length; i++) {
    totalEnergy += channelData[i] * channelData[i]
  }
  const overallEnergy = Math.sqrt(totalEnergy / channelData.length)

  // Estimate tempo from beat intervals
  const beatIntervals: number[] = []
  for (let i = 1; i < beats.length; i++) {
    beatIntervals.push(beats[i].time - beats[i - 1].time)
  }
  const avgInterval = beatIntervals.reduce((a, b) => a + b, 0) / beatIntervals.length
  const tempo = 60 / avgInterval // Convert to BPM

  // Analyze characteristics at each beat
  const beatCharacteristics = beats.map((beat) => {
    const startSample = Math.floor(beat.time * sampleRate)
    const windowSize = Math.floor(0.1 * sampleRate) // 100ms window
    const endSample = Math.min(startSample + windowSize, channelData.length)

    // Calculate energy in different frequency bands
    let bassEnergy = 0
    let highEnergy = 0
    let totalBeatEnergy = 0

    // Simple frequency analysis by looking at signal characteristics
    for (let i = startSample; i < endSample; i++) {
      const sample = channelData[i]
      totalBeatEnergy += sample * sample

      // Approximate bass vs high freq by analyzing local variations
      if (i > startSample) {
        const variation = Math.abs(sample - channelData[i - 1])
        if (variation < 0.1) {
          bassEnergy += sample * sample // Low variation = low frequency
        } else {
          highEnergy += sample * sample // High variation = high frequency
        }
      }
    }

    const windowLength = endSample - startSample
    totalBeatEnergy = Math.sqrt(totalBeatEnergy / windowLength)
    bassEnergy = bassEnergy / windowLength
    highEnergy = highEnergy / windowLength

    const totalFreqEnergy = bassEnergy + highEnergy
    const bassPresence = totalFreqEnergy > 0 ? bassEnergy / totalFreqEnergy : 0.5
    const highFreqPresence = totalFreqEnergy > 0 ? highEnergy / totalFreqEnergy : 0.5

    return {
      time: beat.time,
      energy: totalBeatEnergy,
      bassPresence: Math.min(1, bassPresence),
      highFreqPresence: Math.min(1, highFreqPresence),
    }
  })

  await audioContext.close()

  console.log("[v0] Audio characteristics analyzed: tempo=", tempo.toFixed(1), "BPM")

  return {
    tempo: Math.round(tempo),
    overallEnergy: Math.min(1, overallEnergy * 10), // Normalize to 0-1
    duration,
    beats: beatCharacteristics,
  }
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 100)
  return `${mins}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`
}
