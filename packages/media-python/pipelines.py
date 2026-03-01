"""
CodeIn Media — Pipeline Manager

Manages Stable Diffusion & video pipelines. Downloads models on demand,
caches them, and provides generation methods.

All models stored in ~/.codein/models/media/ (configurable).
Never downloads without explicit user request.
"""

import os
import gc
import time
import shutil
import logging
from pathlib import Path
from typing import Optional, Callable, Dict, Any, List

logger = logging.getLogger("codein-media.pipelines")

# Known model registry
KNOWN_MODELS = {
    # Image models
    "stabilityai/sd-turbo": {
        "type": "image",
        "label": "SD Turbo (CPU-fast)",
        "size_mb": 2500,
        "pipeline_class": "StableDiffusionPipeline",
    },
    "runwayml/stable-diffusion-v1-5": {
        "type": "image",
        "label": "Stable Diffusion 1.5",
        "size_mb": 4200,
        "pipeline_class": "StableDiffusionPipeline",
    },
    "stabilityai/stable-diffusion-xl-base-1.0": {
        "type": "image",
        "label": "SDXL Base 1.0 (GPU)",
        "size_mb": 6800,
        "pipeline_class": "StableDiffusionXLPipeline",
    },
    # Video models
    "stabilityai/stable-video-diffusion-img2vid": {
        "type": "video",
        "label": "SVD Img2Vid",
        "size_mb": 9400,
        "pipeline_class": "StableVideoDiffusionPipeline",
    },
    "stabilityai/stable-video-diffusion-img2vid-xt": {
        "type": "video",
        "label": "SVD Img2Vid-XT (longer)",
        "size_mb": 9400,
        "pipeline_class": "StableVideoDiffusionPipeline",
    },
}


class PipelineManager:
    """Manages model downloads, loading, and generation."""

    def __init__(self, models_dir: Path):
        self.models_dir = Path(models_dir)
        self.models_dir.mkdir(parents=True, exist_ok=True)
        self._loaded_pipelines: Dict[str, Any] = {}
        self._cancelled_jobs: set = set()
        logger.info(f"PipelineManager initialized, models_dir={self.models_dir}")

    # ── Model Management ─────────────────────────────────
    def list_models(self) -> dict:
        """List all known models and their download status."""
        models = []
        for model_id, info in KNOWN_MODELS.items():
            local_path = self.models_dir / model_id.replace("/", "--")
            downloaded = local_path.exists() and any(local_path.iterdir()) if local_path.exists() else False
            size_on_disk = _dir_size_mb(local_path) if downloaded else 0
            models.append({
                "model_id": model_id,
                "label": info["label"],
                "type": info["type"],
                "size_mb": info["size_mb"],
                "downloaded": downloaded,
                "size_on_disk_mb": size_on_disk,
                "loaded": model_id in self._loaded_pipelines,
            })
        return {"models": models}

    def download_model(self, model_id: str) -> dict:
        """Download a model from Hugging Face Hub to local cache."""
        if model_id not in KNOWN_MODELS:
            raise ValueError(f"Unknown model: {model_id}. Known: {list(KNOWN_MODELS.keys())}")

        info = KNOWN_MODELS[model_id]
        local_path = self.models_dir / model_id.replace("/", "--")

        logger.info(f"Downloading model {model_id} ({info['size_mb']}MB)…")
        start = time.time()

        try:
            from huggingface_hub import snapshot_download
            snapshot_download(
                model_id,
                local_dir=str(local_path),
                local_dir_use_symlinks=False,
            )
            elapsed = time.time() - start
            logger.info(f"Model {model_id} downloaded in {elapsed:.1f}s")
            return {
                "model_id": model_id,
                "downloaded": True,
                "path": str(local_path),
                "time_seconds": round(elapsed, 1),
            }
        except Exception as e:
            logger.error(f"Download failed for {model_id}: {e}")
            raise

    def delete_model(self, model_id: str) -> dict:
        """Delete a downloaded model."""
        # Unload first
        if model_id in self._loaded_pipelines:
            del self._loaded_pipelines[model_id]
            gc.collect()
            _torch_empty_cache()

        local_path = self.models_dir / model_id.replace("/", "--")
        if local_path.exists():
            shutil.rmtree(local_path)
            logger.info(f"Deleted model {model_id}")
            return {"model_id": model_id, "deleted": True}
        return {"model_id": model_id, "deleted": False, "reason": "not found"}

    # ── Pipeline Loading ─────────────────────────────────
    def _load_pipeline(self, model_id: str, device: str = "auto"):
        """Load or reuse a pipeline. Lazy-loads on first use."""
        if model_id in self._loaded_pipelines:
            return self._loaded_pipelines[model_id]

        info = KNOWN_MODELS.get(model_id)
        if not info:
            raise ValueError(f"Unknown model: {model_id}")

        local_path = self.models_dir / model_id.replace("/", "--")
        source = str(local_path) if local_path.exists() else model_id

        logger.info(f"Loading pipeline: {model_id} from {source}")
        start = time.time()

        import torch

        # Resolve device
        if device == "auto":
            if torch.cuda.is_available():
                device = "cuda"
            elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
                device = "mps"
            else:
                device = "cpu"

        # Determine dtype
        dtype = torch.float16 if device in ("cuda", "mps") else torch.float32

        pipeline_class = info["pipeline_class"]

        if pipeline_class == "StableDiffusionPipeline":
            from diffusers import StableDiffusionPipeline
            pipe = StableDiffusionPipeline.from_pretrained(
                source, torch_dtype=dtype, safety_checker=None,
            )
        elif pipeline_class == "StableDiffusionXLPipeline":
            from diffusers import StableDiffusionXLPipeline
            pipe = StableDiffusionXLPipeline.from_pretrained(
                source, torch_dtype=dtype,
            )
        elif pipeline_class == "StableVideoDiffusionPipeline":
            from diffusers import StableVideoDiffusionPipeline
            pipe = StableVideoDiffusionPipeline.from_pretrained(
                source, torch_dtype=dtype,
            )
        else:
            raise ValueError(f"Unknown pipeline class: {pipeline_class}")

        pipe = pipe.to(device)
        elapsed = time.time() - start
        logger.info(f"Pipeline {model_id} loaded on {device} in {elapsed:.1f}s")

        # Cache
        self._loaded_pipelines[model_id] = pipe
        return pipe

    # ── Image Generation ─────────────────────────────────
    def generate_image(
        self,
        model_id: str,
        prompt: str,
        negative_prompt: str = "",
        width: int = 512,
        height: int = 512,
        steps: int = 4,
        guidance_scale: float = 0.0,
        seed: int = 42,
        out_path: str = "",
        device: str = "auto",
        progress_callback: Optional[Callable] = None,
    ) -> dict:
        """Generate an image using a Stable Diffusion pipeline."""
        import torch

        pipe = self._load_pipeline(model_id, device)
        generator = torch.Generator(device=pipe.device.type if pipe.device.type != "mps" else "cpu")
        generator.manual_seed(seed)

        logger.info(f"Generating image: {width}×{height}, {steps} steps, seed={seed}")
        start = time.time()

        def step_callback(pipe_obj, step_index, timestep, callback_kwargs):
            if progress_callback:
                progress_callback(step_index + 1, steps)
            return callback_kwargs

        result = pipe(
            prompt=prompt,
            negative_prompt=negative_prompt if negative_prompt else None,
            width=width,
            height=height,
            num_inference_steps=steps,
            guidance_scale=guidance_scale,
            generator=generator,
            callback_on_step_end=step_callback,
        )

        image = result.images[0]
        elapsed = time.time() - start

        # Save
        if out_path:
            Path(out_path).parent.mkdir(parents=True, exist_ok=True)
            image.save(out_path)
            logger.info(f"Image saved: {out_path} ({elapsed:.1f}s)")

        return {
            "path": out_path,
            "width": width,
            "height": height,
            "steps": steps,
            "seed": seed,
            "model_id": model_id,
            "time_seconds": round(elapsed, 1),
        }

    # ── Video Generation ─────────────────────────────────
    def generate_video(
        self,
        model_id: str,
        prompt: str = "",
        input_image_path: Optional[str] = None,
        duration_seconds: int = 4,
        fps: int = 8,
        width: int = 576,
        height: int = 320,
        seed: int = 42,
        out_path: str = "",
        device: str = "auto",
        progress_callback: Optional[Callable] = None,
    ) -> dict:
        """Generate a video using SVD or similar pipeline."""
        import torch
        from PIL import Image

        pipe = self._load_pipeline(model_id, device)

        # SVD requires an input image
        if input_image_path and os.path.exists(input_image_path):
            image = Image.open(input_image_path).convert("RGB").resize((width, height))
        elif prompt:
            # Generate a keyframe first using an image model
            logger.info("Generating keyframe image for video…")
            keyframe_result = self.generate_image(
                model_id="stabilityai/sd-turbo",
                prompt=prompt,
                width=width,
                height=height,
                steps=4,
                seed=seed,
                device=device,
            )
            if keyframe_result.get("path"):
                image = Image.open(keyframe_result["path"]).convert("RGB")
            else:
                raise ValueError("Failed to generate keyframe image for video")
        else:
            raise ValueError("Either prompt or input_image_path is required for video")

        num_frames = duration_seconds * fps
        generator = torch.Generator(device=pipe.device.type if pipe.device.type != "mps" else "cpu")
        generator.manual_seed(seed)

        logger.info(f"Generating video: {num_frames} frames, {fps}fps, {width}×{height}")
        start = time.time()

        def step_callback(pipe_obj, step_index, timestep, callback_kwargs):
            if progress_callback:
                progress_callback(step_index + 1, 25)  # SVD typically ~25 steps
            return callback_kwargs

        result = pipe(
            image,
            num_frames=min(num_frames, 25),  # SVD max ~25 frames
            width=width,
            height=height,
            generator=generator,
            callback_on_step_end=step_callback,
        )

        frames = result.frames[0]  # List of PIL Images
        elapsed = time.time() - start

        # Save as MP4
        if out_path:
            Path(out_path).parent.mkdir(parents=True, exist_ok=True)
            _save_frames_as_mp4(frames, out_path, fps)
            logger.info(f"Video saved: {out_path} ({elapsed:.1f}s)")

        return {
            "path": out_path,
            "duration_seconds": len(frames) / fps,
            "fps": fps,
            "num_frames": len(frames),
            "width": width,
            "height": height,
            "seed": seed,
            "model_id": model_id,
            "time_seconds": round(elapsed, 1),
        }

    # ── Cancellation ─────────────────────────────────────
    def cancel(self, job_id: str):
        self._cancelled_jobs.add(job_id)
        logger.info(f"Cancellation requested for job {job_id}")


# ── Utility Functions ────────────────────────────────────
def _dir_size_mb(path: Path) -> int:
    """Get directory size in MB."""
    try:
        total = sum(f.stat().st_size for f in path.rglob("*") if f.is_file())
        return round(total / (1024 * 1024))
    except Exception:
        return 0


def _torch_empty_cache():
    """Clear GPU cache if available."""
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except ImportError:
        pass


def _save_frames_as_mp4(frames, out_path: str, fps: int):
    """Save PIL Image frames as MP4 using Pillow (fallback) or imageio."""
    try:
        import imageio
        import numpy as np
        writer = imageio.get_writer(out_path, fps=fps, codec="libx264", quality=8)
        for frame in frames:
            writer.append_data(np.array(frame))
        writer.close()
    except ImportError:
        # Fallback: save as GIF
        gif_path = out_path.replace(".mp4", ".gif")
        frames[0].save(
            gif_path,
            save_all=True,
            append_images=frames[1:],
            duration=int(1000 / fps),
            loop=0,
        )
        logger.warning(f"imageio not available, saved as GIF: {gif_path}")
