// Python script for video stitching using FFmpeg
// This would be executed server-side to combine all video clips

const stitchVideosScript = `
import subprocess
import json
import sys
import os
from pathlib import Path

def stitch_videos(video_urls: list, audio_url: str, output_path: str):
    """
    Stitch multiple video clips together with audio using FFmpeg
    """
    print(f"[v0] Stitching {len(video_urls)} videos together")
    
    # Download all videos
    video_files = []
    for i, url in enumerate(video_urls):
        video_file = f"video_{i}.mp4"
        subprocess.run([
            "curl", "-o", video_file, url
        ], check=True)
        video_files.append(video_file)
    
    # Download audio
    audio_file = "audio.mp3"
    subprocess.run([
        "curl", "-o", audio_file, audio_url
    ], check=True)
    
    # Create concat file
    concat_file = "concat.txt"
    with open(concat_file, "w") as f:
        for video_file in video_files:
            f.write(f"file '{video_file}'\\n")
    
    # Concatenate videos
    temp_output = "temp_output.mp4"
    subprocess.run([
        "ffmpeg",
        "-f", "concat",
        "-safe", "0",
        "-i", concat_file,
        "-c", "copy",
        temp_output
    ], check=True)
    
    # Add audio
    subprocess.run([
        "ffmpeg",
        "-i", temp_output,
        "-i", audio_file,
        "-c:v", "copy",
        "-c:a", "aac",
        "-shortest",
        output_path
    ], check=True)
    
    # Cleanup
    for video_file in video_files:
        os.remove(video_file)
    os.remove(audio_file)
    os.remove(concat_file)
    os.remove(temp_output)
    
    print(f"[v0] Video stitching complete: {output_path}")
    return output_path

if __name__ == "__main__":
    data = json.loads(sys.argv[1])
    result = stitch_videos(data["videoUrls"], data["audioUrl"], data["outputPath"])
    print(json.dumps({"output": result}))
`

export default stitchVideosScript
