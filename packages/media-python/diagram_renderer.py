"""
CodeIn Media — Diagram Renderer

Supports Mermaid, PlantUML, and D2 diagram engines.
All rendering is CPU-only, local-only.
"""

import os
import json
import shutil
import logging
import tempfile
import subprocess
from pathlib import Path
from typing import Optional

logger = logging.getLogger("codein-media.diagrams")


class DiagramRenderer:
    """Renders diagrams from source code to SVG/PNG."""

    def __init__(self):
        self._check_engines()

    def _check_engines(self):
        """Check which diagram engines are available."""
        self.engines = {}

        # Mermaid CLI (mmdc)
        if shutil.which("mmdc"):
            self.engines["mermaid"] = "mmdc"
            logger.info("Mermaid CLI (mmdc) found")
        elif shutil.which("npx"):
            self.engines["mermaid"] = "npx"
            logger.info("Mermaid available via npx")
        else:
            logger.warning("Mermaid CLI not found. Install: npm i -g @mermaid-js/mermaid-cli")

        # PlantUML
        if shutil.which("plantuml"):
            self.engines["plantuml"] = "plantuml"
            logger.info("PlantUML found")
        else:
            # Check for plantuml.jar
            jar_path = os.environ.get("PLANTUML_JAR", "")
            if jar_path and os.path.exists(jar_path):
                self.engines["plantuml"] = f"java -jar {jar_path}"
                logger.info(f"PlantUML JAR found: {jar_path}")
            else:
                logger.warning("PlantUML not found. Install: apt install plantuml / brew install plantuml")

        # D2
        if shutil.which("d2"):
            self.engines["d2"] = "d2"
            logger.info("D2 found")
        else:
            logger.warning("D2 not found. Install: https://d2lang.com/tour/install")

    def available_engines(self) -> list:
        """Return list of available engine names."""
        return list(self.engines.keys())

    def render(
        self,
        engine: str = "mermaid",
        source: str = "",
        fmt: str = "svg",
        out_path: str = "",
    ) -> dict:
        """Render a diagram and save to file.

        Args:
            engine: 'mermaid', 'plantuml', or 'd2'
            source: Diagram source code
            fmt: 'svg' or 'png'
            out_path: Output file path

        Returns:
            dict with path, engine, format info
        """
        if not source:
            raise ValueError("Diagram source is required")

        if engine not in ("mermaid", "plantuml", "d2"):
            raise ValueError(f"Unknown engine: {engine}. Supported: mermaid, plantuml, d2")

        if engine not in self.engines:
            raise RuntimeError(
                f"Engine '{engine}' is not installed. "
                f"Available engines: {self.available_engines() or 'none'}"
            )

        if fmt not in ("svg", "png"):
            raise ValueError(f"Unsupported format: {fmt}. Use 'svg' or 'png'")

        # Ensure output directory
        if out_path:
            Path(out_path).parent.mkdir(parents=True, exist_ok=True)

        if engine == "mermaid":
            return self._render_mermaid(source, fmt, out_path)
        elif engine == "plantuml":
            return self._render_plantuml(source, fmt, out_path)
        elif engine == "d2":
            return self._render_d2(source, fmt, out_path)

    def _render_mermaid(self, source: str, fmt: str, out_path: str) -> dict:
        """Render Mermaid diagram."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".mmd", delete=False) as f:
            f.write(source)
            input_path = f.name

        try:
            tool = self.engines["mermaid"]
            if tool == "mmdc":
                cmd = ["mmdc", "-i", input_path, "-o", out_path, "-e", fmt]
            else:
                cmd = ["npx", "-y", "@mermaid-js/mermaid-cli", "mmdc",
                       "-i", input_path, "-o", out_path, "-e", fmt]

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=60,
            )

            if result.returncode != 0:
                raise RuntimeError(f"Mermaid rendering failed: {result.stderr}")

            logger.info(f"Mermaid diagram rendered: {out_path}")
            return {
                "path": out_path,
                "engine": "mermaid",
                "format": fmt,
                "size_bytes": os.path.getsize(out_path) if os.path.exists(out_path) else 0,
            }
        finally:
            os.unlink(input_path)

    def _render_plantuml(self, source: str, fmt: str, out_path: str) -> dict:
        """Render PlantUML diagram."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".puml", delete=False) as f:
            f.write(source)
            input_path = f.name

        try:
            fmt_flag = "-tsvg" if fmt == "svg" else "-tpng"
            tool = self.engines["plantuml"]

            if tool == "plantuml":
                cmd = ["plantuml", fmt_flag, "-pipe"]
            else:
                cmd = tool.split() + [fmt_flag, "-pipe"]

            with open(input_path, "r") as infile:
                result = subprocess.run(
                    cmd,
                    stdin=infile,
                    capture_output=True,
                    timeout=60,
                )

            if result.returncode != 0:
                raise RuntimeError(f"PlantUML rendering failed: {result.stderr.decode()}")

            with open(out_path, "wb") as outfile:
                outfile.write(result.stdout)

            logger.info(f"PlantUML diagram rendered: {out_path}")
            return {
                "path": out_path,
                "engine": "plantuml",
                "format": fmt,
                "size_bytes": os.path.getsize(out_path),
            }
        finally:
            os.unlink(input_path)

    def _render_d2(self, source: str, fmt: str, out_path: str) -> dict:
        """Render D2 diagram."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".d2", delete=False) as f:
            f.write(source)
            input_path = f.name

        try:
            cmd = ["d2", input_path, out_path]

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=60,
            )

            if result.returncode != 0:
                raise RuntimeError(f"D2 rendering failed: {result.stderr}")

            logger.info(f"D2 diagram rendered: {out_path}")
            return {
                "path": out_path,
                "engine": "d2",
                "format": fmt,
                "size_bytes": os.path.getsize(out_path) if os.path.exists(out_path) else 0,
            }
        finally:
            os.unlink(input_path)
