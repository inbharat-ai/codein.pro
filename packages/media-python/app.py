"""
CodeIn Media Python Service — Main FastAPI application

Endpoints:
  GET  /health              → service status + hardware info
  GET  /models/status       → list models + download state
  POST /models/download     → download a model
  POST /models/delete       → delete a model
  POST /generate/image      → generate image from text
  POST /generate/video      → generate video from text/image
  POST /generate/diagram    → render diagram (mermaid/plantuml/d2)
  GET  /progress/{job_id}   → SSE progress stream
  POST /cancel              → cancel running job

Binds to 127.0.0.1 ONLY. No external network access.
"""

import os
import sys
import uuid
import time
import asyncio
import logging
import argparse
from pathlib import Path
from typing import Optional, Dict, Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, Field
import uvicorn

# Local imports
from pipelines import PipelineManager
from diagram_renderer import DiagramRenderer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("codein-media")

# ── Models directory ──────────────────────────────────────
MODELS_DIR = Path(os.environ.get(
    "CODEIN_MODELS_DIR",
    Path.home() / ".codein" / "models" / "media"
))
MODELS_DIR.mkdir(parents=True, exist_ok=True)

# ── App ───────────────────────────────────────────────────
app = FastAPI(
    title="CodeIn Media Service",
    description="Local-only media generation for CodeIn Computer",
    version="0.1.0",
)

# Global state
pipeline_mgr: Optional[PipelineManager] = None
diagram_renderer: Optional[DiagramRenderer] = None
active_jobs: Dict[str, Dict[str, Any]] = {}
job_progress: Dict[str, list] = {}  # job_id → list of progress events


# ── Request/Response Models ───────────────────────────────
class ImageRequest(BaseModel):
    prompt: str
    negative_prompt: str = ""
    model_id: str = "stabilityai/sd-turbo"
    width: int = 512
    height: int = 512
    steps: int = 4
    guidance_scale: float = 0.0
    seed: int = Field(default_factory=lambda: int(time.time()) % 2147483647)
    out_path: str = ""
    device: str = "auto"
    job_id: str = Field(default_factory=lambda: uuid.uuid4().hex[:16])


class VideoRequest(BaseModel):
    prompt: str = ""
    model_id: str = "stabilityai/stable-video-diffusion-img2vid"
    input_image_path: Optional[str] = None
    duration_seconds: int = 4
    fps: int = 8
    width: int = 576
    height: int = 320
    seed: int = Field(default_factory=lambda: int(time.time()) % 2147483647)
    out_path: str = ""
    device: str = "auto"
    job_id: str = Field(default_factory=lambda: uuid.uuid4().hex[:16])


class DiagramRequest(BaseModel):
    engine: str = "mermaid"
    source: str
    format: str = "svg"
    out_path: str = ""


class ModelAction(BaseModel):
    model_id: str


class CancelRequest(BaseModel):
    job_id: str


# ── Health ────────────────────────────────────────────────
@app.get("/health")
async def health():
    import psutil
    gpu_info = _detect_gpu()
    return {
        "status": "ok",
        "version": "0.1.0",
        "pid": os.getpid(),
        "cpu_count": psutil.cpu_count(logical=True),
        "memory_total_gb": round(psutil.virtual_memory().total / (1024**3), 1),
        "memory_available_gb": round(psutil.virtual_memory().available / (1024**3), 1),
        "gpu": gpu_info,
        "models_dir": str(MODELS_DIR),
        "active_jobs": len(active_jobs),
    }


def _detect_gpu():
    """Detect GPU info for health endpoint."""
    try:
        import torch
        if torch.cuda.is_available():
            return {
                "available": True,
                "backend": "cuda",
                "name": torch.cuda.get_device_name(0),
                "vram_gb": round(torch.cuda.get_device_properties(0).total_mem / (1024**3), 1),
            }
        elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return {"available": True, "backend": "mps", "name": "Apple Silicon"}
        else:
            return {"available": False, "backend": "cpu"}
    except ImportError:
        return {"available": False, "backend": "cpu", "note": "torch not installed"}


# ── Models ────────────────────────────────────────────────
@app.get("/models/status")
async def models_status():
    return pipeline_mgr.list_models() if pipeline_mgr else {"models": []}


@app.post("/models/download")
async def download_model(req: ModelAction):
    if not pipeline_mgr:
        raise HTTPException(503, "Pipeline manager not initialized")
    try:
        result = await asyncio.to_thread(pipeline_mgr.download_model, req.model_id)
        return result
    except Exception as e:
        logger.error(f"Model download failed: {e}")
        raise HTTPException(500, str(e))


@app.post("/models/delete")
async def delete_model(req: ModelAction):
    if not pipeline_mgr:
        raise HTTPException(503, "Pipeline manager not initialized")
    try:
        result = pipeline_mgr.delete_model(req.model_id)
        return result
    except Exception as e:
        logger.error(f"Model delete failed: {e}")
        raise HTTPException(500, str(e))


# ── Image Generation ─────────────────────────────────────
@app.post("/generate/image")
async def generate_image(req: ImageRequest):
    if not pipeline_mgr:
        raise HTTPException(503, "Pipeline manager not initialized")

    job_id = req.job_id
    active_jobs[job_id] = {"type": "image", "status": "running", "started": time.time()}
    job_progress[job_id] = []

    def progress_cb(step, total):
        pct = round((step / max(total, 1)) * 100)
        job_progress.setdefault(job_id, []).append({
            "step": step, "total": total, "percent": pct, "time": time.time()
        })

    try:
        result = await asyncio.to_thread(
            pipeline_mgr.generate_image,
            model_id=req.model_id,
            prompt=req.prompt,
            negative_prompt=req.negative_prompt,
            width=req.width,
            height=req.height,
            steps=req.steps,
            guidance_scale=req.guidance_scale,
            seed=req.seed,
            out_path=req.out_path,
            device=req.device,
            progress_callback=progress_cb,
        )
        active_jobs[job_id]["status"] = "completed"
        return {**result, "success": True, "job_id": job_id}
    except Exception as e:
        active_jobs[job_id]["status"] = "failed"
        logger.error(f"Image generation failed [{job_id}]: {e}")
        error_str = str(e)
        if "out of memory" in error_str.lower() or "oom" in error_str.lower():
            return {"success": False, "error": f"out of memory: {error_str}", "job_id": job_id}
        return {"success": False, "error": error_str, "job_id": job_id}
    finally:
        # Clean up after a delay
        asyncio.get_event_loop().call_later(300, lambda: _cleanup_job(job_id))


# ── Video Generation ─────────────────────────────────────
@app.post("/generate/video")
async def generate_video(req: VideoRequest):
    if not pipeline_mgr:
        raise HTTPException(503, "Pipeline manager not initialized")

    job_id = req.job_id
    active_jobs[job_id] = {"type": "video", "status": "running", "started": time.time()}
    job_progress[job_id] = []

    def progress_cb(step, total):
        pct = round((step / max(total, 1)) * 100)
        job_progress.setdefault(job_id, []).append({
            "step": step, "total": total, "percent": pct, "time": time.time()
        })

    try:
        result = await asyncio.to_thread(
            pipeline_mgr.generate_video,
            model_id=req.model_id,
            prompt=req.prompt,
            input_image_path=req.input_image_path,
            duration_seconds=req.duration_seconds,
            fps=req.fps,
            width=req.width,
            height=req.height,
            seed=req.seed,
            out_path=req.out_path,
            device=req.device,
            progress_callback=progress_cb,
        )
        active_jobs[job_id]["status"] = "completed"
        return {**result, "success": True, "job_id": job_id}
    except Exception as e:
        active_jobs[job_id]["status"] = "failed"
        logger.error(f"Video generation failed [{job_id}]: {e}")
        error_str = str(e)
        if "out of memory" in error_str.lower() or "oom" in error_str.lower():
            return {"success": False, "error": f"out of memory: {error_str}", "job_id": job_id}
        return {"success": False, "error": error_str, "job_id": job_id}
    finally:
        asyncio.get_event_loop().call_later(300, lambda: _cleanup_job(job_id))


# ── Diagram ──────────────────────────────────────────────
@app.post("/generate/diagram")
async def generate_diagram(req: DiagramRequest):
    if not diagram_renderer:
        raise HTTPException(503, "Diagram renderer not initialized")
    try:
        result = await asyncio.to_thread(
            diagram_renderer.render,
            engine=req.engine,
            source=req.source,
            fmt=req.format,
            out_path=req.out_path,
        )
        return {**result, "success": True}
    except Exception as e:
        logger.error(f"Diagram rendering failed: {e}")
        return {"success": False, "error": str(e)}


# ── Progress SSE ─────────────────────────────────────────
@app.get("/progress/{job_id}")
async def progress_stream(job_id: str):
    if job_id not in active_jobs:
        raise HTTPException(404, f"Job {job_id} not found")

    async def event_generator():
        last_idx = 0
        while True:
            events = job_progress.get(job_id, [])
            for evt in events[last_idx:]:
                yield f"data: {_json_dumps(evt)}\n\n"
            last_idx = len(events)

            status = active_jobs.get(job_id, {}).get("status", "unknown")
            if status in ("completed", "failed", "cancelled"):
                yield f"data: {_json_dumps({'status': status, 'done': True})}\n\n"
                break
            await asyncio.sleep(0.5)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ── Cancel ───────────────────────────────────────────────
@app.post("/cancel")
async def cancel_job(req: CancelRequest):
    job = active_jobs.get(req.job_id)
    if not job:
        raise HTTPException(404, f"Job {req.job_id} not found")
    job["status"] = "cancelled"
    # Pipeline manager should check cancellation flag
    if pipeline_mgr:
        pipeline_mgr.cancel(req.job_id)
    return {"cancelled": True, "job_id": req.job_id}


# ── Helpers ──────────────────────────────────────────────
def _cleanup_job(job_id):
    active_jobs.pop(job_id, None)
    job_progress.pop(job_id, None)


def _json_dumps(obj):
    import json
    return json.dumps(obj)


# ── Startup ──────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    global pipeline_mgr, diagram_renderer
    logger.info(f"Models directory: {MODELS_DIR}")
    pipeline_mgr = PipelineManager(models_dir=MODELS_DIR)
    diagram_renderer = DiagramRenderer()
    logger.info("CodeIn Media Service ready")


def main():
    parser = argparse.ArgumentParser(description="CodeIn Media Service")
    parser.add_argument("--port", type=int, default=43130, help="Port to bind (default: 43130)")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host to bind (MUST be 127.0.0.1)")
    parser.add_argument("--log-level", type=str, default="info")
    args = parser.parse_args()

    # SECURITY: Force local-only binding
    if args.host != "127.0.0.1":
        logger.warning(f"Overriding host {args.host} → 127.0.0.1 (local-only)")
        args.host = "127.0.0.1"

    logger.info(f"Starting CodeIn Media Service on {args.host}:{args.port}")
    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        log_level=args.log_level,
        access_log=False,
    )


if __name__ == "__main__":
    main()
