"""Build and test public pages in production mode without local credentials or backend access.

Run: .venv/bin/python frontend/tests/support/run-production-preview.py
"""
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import tempfile
import time

import httpx

root = Path(__file__).resolve().parents[3]
with socket.socket() as sock:
    if sock.connect_ex(("127.0.0.1", 3103)) == 0:
        raise RuntimeError("Port 3103 occupied; leaving its process untouched")

with tempfile.TemporaryDirectory(prefix="swapster-production-preview-") as temporary:
    target = Path(temporary) / "frontend"
    shutil.copytree(root / "frontend", target, ignore=shutil.ignore_patterns(
        "node_modules", ".next", ".env*", "*.tsbuildinfo", "test-results", "playwright-report"))
    (target / "node_modules").symlink_to(root / "frontend/node_modules", target_is_directory=True)
    # Explicit public test configuration; never load developer .env files.
    env = {key: value for key, value in os.environ.items()
           if not key.startswith(("NEXT_PUBLIC_", "SUPABASE_", "DATABASE_", "VERCEL"))}
    env.update(PATH="/opt/homebrew/opt/node@22/bin:" + os.environ["PATH"],
               NODE_ENV="production", VERCEL="0", NEXT_PUBLIC_SUPABASE_URL="",
               NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="", NEXT_PUBLIC_API_URL="https://api.example.invalid",
               PRODUCTION_PREVIEW_TEST="1", PLAYWRIGHT_BASE_URL="http://localhost:3103")
    subprocess.run(["npm", "run", "build"], cwd=target, env=env, check=True)
    subprocess.run(["npm", "run", "typecheck"], cwd=target, env=env, check=True)
    process = subprocess.Popen(["npm", "run", "start", "--", "--port", "3103"],
                               cwd=target, env=env, start_new_session=True)
    try:
        with httpx.Client(timeout=10, trust_env=False) as client:
            for _ in range(60):
                try:
                    client.get("http://localhost:3103").raise_for_status()
                    break
                except httpx.HTTPError:
                    if process.poll() is not None:
                        raise RuntimeError("Production preview server exited")
                    time.sleep(.5)
            else:
                raise RuntimeError("Production preview server readiness timeout")
        subprocess.run(["npm", "run", "test:e2e", "--", "tests/production-homepage.spec.ts", "tests/business-simulation.spec.ts", "tests/business-preview.spec.ts"],
                       cwd=target, env=env, check=True)
    finally:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
