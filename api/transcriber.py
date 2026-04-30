import os
import tempfile
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf
import torch
import whisper


def transcribe(audio_path: str) -> dict:
    path = Path(audio_path)
    suffix = path.suffix.lower()

    with tempfile.TemporaryDirectory() as tmp_dir:
        wav_path = os.path.join(tmp_dir, "audio.wav")

        if suffix in {".mp3", ".mp4", ".m4a"}:
            from pydub import AudioSegment
            audio_seg = AudioSegment.from_file(audio_path)
            audio_seg = audio_seg.set_frame_rate(16000).set_channels(1)
            audio_seg.export(wav_path, format="wav")
            audio, sr = librosa.load(wav_path, sr=16000, mono=True)
        else:
            # WAV or unknown — librosa handles resampling/mono conversion
            audio, sr = librosa.load(audio_path, sr=16000, mono=True)
            sf.write(wav_path, audio, sr)

        duration = len(audio) / sr

        gpu_available = torch.cuda.is_available()
        model_name = "small" if gpu_available else "base"
        model = whisper.load_model(model_name)

        result = model.transcribe(wav_path, word_timestamps=False)

    segments = [
        {
            "start": float(seg["start"]),
            "end": float(seg["end"]),
            "text": seg["text"].strip(),
        }
        for seg in result.get("segments", [])
    ]

    return {
        "transcript": result["text"].strip(),
        "segments": segments,
        "language": result.get("language", "unknown"),
        "duration_seconds": round(duration, 3),
    }
