import sys
import json
import subprocess
import tempfile
import os
from urllib.request import urlretrieve

def download_file(url, filepath):
    """Download a file from URL to filepath"""
    print(f"[v0] Downloading {url}")
    urlretrieve(url, filepath)
    return filepath

def stitch_videos_with_audio(video_urls, audio_url, output_filename):
    """
    Stitch multiple video clips together and add audio track
    """
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            # Download all videos
            video_files = []
            for i, url in enumerate(video_urls):
                video_path = os.path.join(temp_dir, f"scene_{i:03d}.mp4")
                download_file(url, video_path)
                video_files.append(video_path)
            
            # Download audio
            audio_path = os.path.join(temp_dir, "audio.mp3")
            download_file(audio_url, audio_path)
            
            # Create concat file for FFmpeg
            concat_file = os.path.join(temp_dir, "concat.txt")
            with open(concat_file, 'w') as f:
                for video_file in video_files:
                    f.write(f"file '{video_file}'\n")
            
            # Concatenate videos without audio
            temp_video = os.path.join(temp_dir, "concatenated.mp4")
            concat_cmd = [
                'ffmpeg',
                '-f', 'concat',
                '-safe', '0',
                '-i', concat_file,
                '-c', 'copy',
                temp_video
            ]
            
            print("[v0] Concatenating video clips...")
            subprocess.run(concat_cmd, check=True, capture_output=True)
            
            # Add audio track to concatenated video
            output_path = os.path.join(temp_dir, output_filename)
            audio_cmd = [
                'ffmpeg',
                '-i', temp_video,
                '-i', audio_path,
                '-c:v', 'copy',
                '-c:a', 'aac',
                '-shortest',  # Match the shortest stream (video or audio)
                output_path
            ]
            
            print("[v0] Adding audio track...")
            subprocess.run(audio_cmd, check=True, capture_output=True)
            
            # Read the final video file
            with open(output_path, 'rb') as f:
                video_data = f.read()
            
            return {
                'success': True,
                'output_path': output_path,
                'size': len(video_data)
            }
            
    except subprocess.CalledProcessError as e:
        return {
            'success': False,
            'error': f'FFmpeg error: {e.stderr.decode() if e.stderr else str(e)}'
        }
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }

if __name__ == "__main__":
    # Read input from stdin
    input_data = json.loads(sys.stdin.read())
    
    video_urls = input_data.get('videoUrls', [])
    audio_url = input_data.get('audioUrl')
    output_filename = input_data.get('outputFilename', 'final-video.mp4')
    
    result = stitch_videos_with_audio(video_urls, audio_url, output_filename)
    print(json.dumps(result))
