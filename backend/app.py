#!/usr/bin/env python

import json
import os
import logging
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import Response, JSONResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ---------------------------------------------------------------------
# Logging setup
# ---------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------
# Configuration & environment
# ---------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(REPO_ROOT / ".env")

FRB_VIEWER_USER = os.getenv("FRB_VIEWER_USER", "frb")
FRB_VIEWER_PASSWORD = os.getenv("FRB_VIEWER_PASSWORD", "changeme")

CHIME_PATH_ROOT_ENV = os.getenv("CHIME_PATH_ROOT")
CHIME_HOST_ROOT_ENV = os.getenv("CHIME_HOST_ROOT")
CHIME_DATA_SOURCES_ENV = os.getenv("CHIME_DATA_SOURCES", "")

# Parse available data sources from env
AVAILABLE_DATA_SOURCES: Dict[str, Path] = {}
if CHIME_DATA_SOURCES_ENV:
    for source in CHIME_DATA_SOURCES_ENV.split(","):
        if ":" in source:
            name, path_str = source.split(":", 1)
            source_path = Path(path_str.strip()).expanduser().resolve()
            if source_path.exists():
                AVAILABLE_DATA_SOURCES[name.strip()] = source_path
            else:
                logger.warning(f"Data source '{name}' path does not exist: {source_path}")

# Current active data source
ACTIVE_DATA_SOURCE: Optional[str] = None

if not CHIME_PATH_ROOT_ENV:
    logger.warning(
        "CHIME_PATH_ROOT is not set in .env; /api/image for chime-path may fail"
    )

CHIME_PATH_ROOT: Optional[Path] = (
    Path(CHIME_PATH_ROOT_ENV).expanduser().resolve()
    if CHIME_PATH_ROOT_ENV
    else None
)

if CHIME_PATH_ROOT and not CHIME_PATH_ROOT.exists():
    logger.warning(f"CHIME_PATH_ROOT does not exist: {CHIME_PATH_ROOT}")
    CHIME_PATH_ROOT = None

# Determine active data source name
if CHIME_PATH_ROOT:
    for name, path in AVAILABLE_DATA_SOURCES.items():
        if path == CHIME_PATH_ROOT:
            ACTIVE_DATA_SOURCE = name
            break
    if not ACTIVE_DATA_SOURCE and AVAILABLE_DATA_SOURCES:
        # Default to first available if current path doesn't match any named source
        ACTIVE_DATA_SOURCE = list(AVAILABLE_DATA_SOURCES.keys())[0]

if CHIME_HOST_ROOT_ENV:
    CHIME_HOST_ROOT: Optional[Path] = (
        Path(CHIME_HOST_ROOT_ENV).expanduser().resolve()
    )
    if not CHIME_HOST_ROOT.exists():
        logger.warning(f"CHIME_HOST_ROOT does not exist: {CHIME_HOST_ROOT}")
        CHIME_HOST_ROOT = None
else:
    CHIME_HOST_ROOT = None

logger.info(f"Available data sources: {list(AVAILABLE_DATA_SOURCES.keys())}")
logger.info(f"Active data source: {ACTIVE_DATA_SOURCE}")

INDEX_PATH = REPO_ROOT / "backend" / "frb_index.json"
PATH_TABLE_PATH = REPO_ROOT / "backend" / "path_table.json"

# ---------------------------------------------------------------------
# Load FRB index at startup (small file ~744KB)
# PATH_TABLE is loaded lazily to avoid memory issues with large files
# ---------------------------------------------------------------------

FRB_INDEX: List[Dict[str, Any]] = []
_PATH_TABLE_CACHE: Optional[List[Dict[str, Any]]] = None
_PATH_TABLE_COUNT: Optional[int] = None

if INDEX_PATH.exists():
    try:
        with INDEX_PATH.open() as f:
            FRB_INDEX = json.load(f)
        logger.info(
            f"Loaded FRB index with {len(FRB_INDEX)} entries from {INDEX_PATH}"
        )
    except (json.JSONDecodeError, IOError) as exc:
        logger.error(f"Failed to load {INDEX_PATH}: {exc}")
        FRB_INDEX = []
else:
    logger.warning(
        f"FRB index file not found at {INDEX_PATH}; /api/index will return empty list"
    )


def get_path_table_count() -> int:
    """Get the total count of PATH table rows without loading entire file."""
    global _PATH_TABLE_COUNT
    if _PATH_TABLE_COUNT is not None:
        return _PATH_TABLE_COUNT

    if not PATH_TABLE_PATH.exists():
        _PATH_TABLE_COUNT = 0
        return 0

    try:
        with PATH_TABLE_PATH.open() as f:
            data = json.load(f)
            _PATH_TABLE_COUNT = len(data) if isinstance(data, list) else 0
            return _PATH_TABLE_COUNT
    except (json.JSONDecodeError, IOError) as exc:
        logger.error(f"Failed to count rows in {PATH_TABLE_PATH}: {exc}")
        _PATH_TABLE_COUNT = 0
        return 0


def get_path_table() -> List[Dict[str, Any]]:
    """Lazy load PATH table - only loads when first accessed."""
    global _PATH_TABLE_CACHE
    if _PATH_TABLE_CACHE is not None:
        return _PATH_TABLE_CACHE

    if not PATH_TABLE_PATH.exists():
        logger.warning(
            f"PATH candidate table not found at {PATH_TABLE_PATH}; "
            "/api/path-table will return empty list"
        )
        _PATH_TABLE_CACHE = []
        return _PATH_TABLE_CACHE

    try:
        with PATH_TABLE_PATH.open() as f:
            _PATH_TABLE_CACHE = json.load(f)
        logger.info(
            f"Loaded PATH candidate table with {len(_PATH_TABLE_CACHE)} rows from {PATH_TABLE_PATH}"
        )
        return _PATH_TABLE_CACHE
    except (json.JSONDecodeError, IOError) as exc:
        logger.error(f"Failed to load {PATH_TABLE_PATH}: {exc}")
        _PATH_TABLE_CACHE = []
        return _PATH_TABLE_CACHE

# ---------------------------------------------------------------------
# Security (HTTP Basic)
# ---------------------------------------------------------------------

security = HTTPBasic()


def get_current_user(credentials: HTTPBasicCredentials = Depends(security)) -> str:
  correct_username = credentials.username == FRB_VIEWER_USER
  correct_password = credentials.password == FRB_VIEWER_PASSWORD

  if not (correct_username and correct_password):
      logger.warning(
          f"Unauthorized access attempt with username='{credentials.username}'"
      )
      raise HTTPException(status_code=401, detail="Unauthorized")

  return credentials.username


# ---------------------------------------------------------------------
# FastAPI app (THIS is what uvicorn expects)
# ---------------------------------------------------------------------

app = FastAPI(title="CHIME FRB Viewer")  # <<< this must exist at top level

# # Serve frontend
# frontend_dir = REPO_ROOT / "frontend"
# if not frontend_dir.exists():
#   logger.warning(f"Frontend directory does not exist: {frontend_dir}")
# app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")


# ---------------------------------------------------------------------
# API endpoints
# ---------------------------------------------------------------------


@app.get("/api/health")
def health_check() -> Dict[str, str]:
  return {"status": "ok"}


@app.get("/api/index")
def get_index(user: str = Depends(get_current_user)) -> List[Dict[str, Any]]:
  if not FRB_INDEX:
      logger.warning("/api/index requested but FRB_INDEX is empty")
  return FRB_INDEX


class PaginatedResponse(BaseModel):
    data: List[Dict[str, Any]]
    total: int
    offset: int
    limit: int
    has_more: bool


@app.get("/api/path-table")
def api_get_path_table(
    user: str = Depends(get_current_user),
    offset: int = Query(0, ge=0, description="Number of rows to skip"),
    limit: int = Query(1000, ge=1, le=10000, description="Max rows to return (1-10000)"),
    frb_id: Optional[str] = Query(None, description="Filter by FRB ID (exact match)"),
    top_n: Optional[int] = Query(None, ge=1, le=100, description="Return only top N candidates per FRB (by P_Ox)"),
) -> PaginatedResponse:
    """
    Get PATH candidate table with pagination support.
    Returns up to 1000 rows by default to avoid browser memory issues.
    Use top_n=1 for top candidate only, top_n=2 for top two, etc.
    """
    path_table = get_path_table()

    if not path_table:
        logger.warning("/api/path-table requested but PATH_TABLE is empty")
        return PaginatedResponse(data=[], total=0, offset=offset, limit=limit, has_more=False)

    # Apply FRB ID filter if provided (server-side filtering)
    if frb_id:
        filtered = [row for row in path_table if row.get("frb_id") == frb_id]
    else:
        filtered = path_table

    # Filter to top N candidates per FRB if requested
    if top_n is not None:
        from collections import defaultdict
        candidates_by_frb: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for row in filtered:
            fid = row.get("frb_id")
            if fid:
                candidates_by_frb[fid].append(row)

        # Sort each FRB's candidates by P_Ox descending and take top N
        filtered = []
        for fid, candidates in candidates_by_frb.items():
            sorted_cands = sorted(
                candidates,
                key=lambda r: r.get("pox") if r.get("pox") is not None else -1,
                reverse=True
            )
            filtered.extend(sorted_cands[:top_n])

    total = len(filtered)

    # Apply pagination
    paginated = filtered[offset:offset + limit]
    has_more = (offset + limit) < total

    return PaginatedResponse(
        data=paginated,
        total=total,
        offset=offset,
        limit=limit,
        has_more=has_more
    )


@app.get("/api/image")
def get_image(
    repo: str = Query(..., description="Source repo, e.g. 'chime-path' or 'chime-host-analysis'"),
    rel_path: str = Query(..., description="Path relative to the repo root"),
    user: str = Depends(get_current_user),
) -> Response:
    if repo == "chime-path":
        root = CHIME_PATH_ROOT
    elif repo == "chime-host-analysis":
        root = CHIME_HOST_ROOT
    else:
        logger.warning(f"/api/image called with unknown repo='{repo}'")
        raise HTTPException(status_code=400, detail="Unknown repo")

    if root is None:
        logger.error(f"/api/image: root for repo='{repo}' is not configured")
        raise HTTPException(
            status_code=500,
            detail=f"Root path not configured for repo '{repo}'",
        )

    img_path = root / rel_path

    try:
        img_path_resolved = img_path.resolve()
    except (OSError, ValueError) as exc:
        logger.error(f"/api/image: failed to resolve path '{img_path}': {exc}")
        raise HTTPException(status_code=400, detail="Invalid image path")

    # SECURITY FIX: Proper path traversal check using is_relative_to (Python 3.9+)
    # This ensures the resolved path is actually within the root directory
    try:
        if not img_path_resolved.is_relative_to(root):
            logger.warning(
                f"/api/image: attempted path traversal: {img_path_resolved}"
            )
            raise HTTPException(status_code=400, detail="Invalid image path")
    except AttributeError:
        # Fallback for Python < 3.9: check if resolved path starts with root
        root_str = str(root.resolve())
        if not str(img_path_resolved).startswith(root_str + os.sep):
            logger.warning(
                f"/api/image: attempted path traversal: {img_path_resolved}"
            )
            raise HTTPException(status_code=400, detail="Invalid image path")

    if not img_path_resolved.exists():
        logger.warning(f"/api/image: file not found: {img_path_resolved}")
        raise HTTPException(status_code=404, detail="Image not found")

    if not img_path_resolved.is_file():
        logger.warning(f"/api/image: not a file: {img_path_resolved}")
        raise HTTPException(status_code=400, detail="Invalid image path")

    try:
        data = img_path_resolved.read_bytes()
    except (IOError, PermissionError) as exc:
        logger.error(f"/api/image: failed to read {img_path_resolved}: {exc}")
        raise HTTPException(status_code=500, detail="Failed to read image")

    # Add caching headers - images are static, cache for 24 hours
    headers = {
        "Cache-Control": "public, max-age=86400",
        "ETag": f'"{hash(img_path_resolved.stat().st_mtime)}"',
    }

    return Response(content=data, media_type="image/png", headers=headers)

@app.get("/api/data-sources")
def get_data_sources(user: str = Depends(get_current_user)) -> Dict[str, Any]:
    """List available data sources and the currently active one."""
    return {
        "sources": list(AVAILABLE_DATA_SOURCES.keys()),
        "active": ACTIVE_DATA_SOURCE,
        "paths": {name: str(path) for name, path in AVAILABLE_DATA_SOURCES.items()},
    }


@app.post("/api/data-sources/switch")
def switch_data_source(
    source_name: str = Query(..., description="Name of the data source to switch to"),
    user: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Switch to a different data source.
    This will rebuild the index files and reload the data.
    """
    global ACTIVE_DATA_SOURCE, CHIME_PATH_ROOT, _PATH_TABLE_CACHE, _PATH_TABLE_COUNT, FRB_INDEX

    if source_name not in AVAILABLE_DATA_SOURCES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown data source: {source_name}. Available: {list(AVAILABLE_DATA_SOURCES.keys())}"
        )

    new_path = AVAILABLE_DATA_SOURCES[source_name]
    logger.info(f"Switching data source to '{source_name}' at {new_path}")

    # Update the active path
    CHIME_PATH_ROOT = new_path
    ACTIVE_DATA_SOURCE = source_name

    # Clear cached data to force reload
    _PATH_TABLE_CACHE = None
    _PATH_TABLE_COUNT = None

    # Rebuild the index
    try:
        import subprocess
        result = subprocess.run(
            ["python", str(REPO_ROOT / "backend" / "build_index.py")],
            capture_output=True,
            text=True,
            timeout=300,
            env={**os.environ, "CHIME_PATH_ROOT": str(new_path)}
        )
        if result.returncode != 0:
            logger.error(f"Index rebuild failed: {result.stderr}")
            raise HTTPException(status_code=500, detail="Failed to rebuild index")

        # Reload the FRB index
        if INDEX_PATH.exists():
            with INDEX_PATH.open() as f:
                FRB_INDEX.clear()
                FRB_INDEX.extend(json.load(f))
            logger.info(f"Reloaded FRB index with {len(FRB_INDEX)} entries")

        return {
            "status": "success",
            "active": ACTIVE_DATA_SOURCE,
            "frb_count": len(FRB_INDEX),
            "message": f"Switched to '{source_name}' and rebuilt index"
        }

    except subprocess.TimeoutExpired:
        logger.error("Index rebuild timed out")
        raise HTTPException(status_code=500, detail="Index rebuild timed out")
    except (IOError, json.JSONDecodeError) as exc:
        logger.error(f"Failed to reload index after switch: {exc}")
        raise HTTPException(status_code=500, detail="Failed to reload index")


# ---------------------------------------------------------------------
# Mount frontend AFTER defining API routes
# ---------------------------------------------------------------------
frontend_dir = REPO_ROOT / "frontend"
if not frontend_dir.exists():
    logger.warning(f"Frontend directory does not exist: {frontend_dir}")
app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
