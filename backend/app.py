import os
import json
from pathlib import Path

from fastapi import FastAPI, Depends, HTTPException
from fastapi.responses import Response
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

# Load .env from repo root
REPO_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(REPO_ROOT / ".env")

USERNAME = os.getenv("FRB_VIEWER_USER", "frb")
PASSWORD = os.getenv("FRB_VIEWER_PASSWORD", "changeme")

# Where build_index.py writes the combined index
INDEX_PATH = REPO_ROOT / "backend" / "frb_index.json"

# FastAPI security object for HTTP Basic auth
security = HTTPBasic()

app = FastAPI(title="FRB Viewer backend")


def check_auth(credentials: HTTPBasicCredentials = Depends(security)):
    """Simple username/password check for all /api routes."""
    if credentials.username != USERNAME or credentials.password != PASSWORD:
        # If wrong, browser will pop up login again
        raise HTTPException(status_code=401, detail="Unauthorized")
    return credentials.username


# --- API endpoints ---------------------------------------------------------


@app.get("/api/index")
def get_index(user: str = Depends(check_auth)):
    """Return the aggregated FRB index as JSON."""
    if not INDEX_PATH.exists():
        raise HTTPException(status_code=500, detail="Index file not found. Run build_index.py.")
    try:
        with INDEX_PATH.open() as f:
            data = json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read index: {e}")
    return data


@app.get("/api/image")
def get_image(repo: str, rel_path: str, user: str = Depends(check_auth)):
    """
    Stream a PNG from one of the data repos.

    repo: which repo to use ("chime-path" for now)
    rel_path: path relative to that repo's root.
    """
    # For now we support chime-path only; host repo can be added later
    if repo == "chime-path":
        root_env = "CHIME_PATH_ROOT"
    else:
        # TODO: add chime-host-analysis, etc.
        raise HTTPException(status_code=400, detail=f"Unknown repo '{repo}'")

    root = os.getenv(root_env)
    if not root:
        raise HTTPException(status_code=500, detail=f"{root_env} not set in .env")

    root_path = Path(root)
    img_path = root_path / rel_path

    if not img_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")

    data = img_path.read_bytes()
    return Response(content=data, media_type="image/png")


# --- Static frontend -------------------------------------------------------

# Serve frontend/index.html and assets at root "/"
frontend_dir = REPO_ROOT / "frontend"
app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
