#!/usr/bin/env python

import json
import os
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import Response
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.staticfiles import StaticFiles

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

if CHIME_HOST_ROOT_ENV:
  CHIME_HOST_ROOT: Optional[Path] = (
      Path(CHIME_HOST_ROOT_ENV).expanduser().resolve()
  )
  if not CHIME_HOST_ROOT.exists():
      logger.warning(f"CHIME_HOST_ROOT does not exist: {CHIME_HOST_ROOT}")
      CHIME_HOST_ROOT = None
else:
  CHIME_HOST_ROOT = None

INDEX_PATH = REPO_ROOT / "backend" / "frb_index.json"
PATH_TABLE_PATH = REPO_ROOT / "backend" / "path_table.json"

# ---------------------------------------------------------------------
# Load data at startup
# ---------------------------------------------------------------------

FRB_INDEX: List[Dict[str, Any]] = []
PATH_TABLE: List[Dict[str, Any]] = []

if INDEX_PATH.exists():
  try:
      with INDEX_PATH.open() as f:
          FRB_INDEX = json.load(f)
      logger.info(
          f"Loaded FRB index with {len(FRB_INDEX)} entries from {INDEX_PATH}"
      )
  except Exception as exc:
      logger.error(f"Failed to load {INDEX_PATH}: {exc}")
      FRB_INDEX = []
else:
  logger.warning(
      f"FRB index file not found at {INDEX_PATH}; /api/index will return empty list"
  )

if PATH_TABLE_PATH.exists():
  try:
      with PATH_TABLE_PATH.open() as f:
          PATH_TABLE = json.load(f)
      logger.info(
          f"Loaded PATH candidate table with {len(PATH_TABLE)} rows from {PATH_TABLE_PATH}"
      )
  except Exception as exc:
      logger.error(f"Failed to load {PATH_TABLE_PATH}: {exc}")
      PATH_TABLE = []
else:
  logger.warning(
      f"PATH candidate table not found at {PATH_TABLE_PATH}; "
      "/api/path-table will return empty list"
  )

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


@app.get("/api/path-table")
def get_path_table(user: str = Depends(get_current_user)) -> List[Dict[str, Any]]:
  if not PATH_TABLE:
      logger.warning("/api/path-table requested but PATH_TABLE is empty")
  return PATH_TABLE


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
  except Exception as exc:
      logger.error(f"/api/image: failed to resolve path '{img_path}': {exc}")
      raise HTTPException(status_code=400, detail="Invalid image path")

  if root not in img_path_resolved.parents and img_path_resolved != root:
      logger.warning(
          f"/api/image: attempted path traversal: {img_path_resolved}"
      )
      raise HTTPException(status_code=400, detail="Invalid image path")

  if not img_path_resolved.exists():
      logger.warning(f"/api/image: file not found: {img_path_resolved}")
      raise HTTPException(status_code=404, detail="Image not found")

  try:
      data = img_path_resolved.read_bytes()
  except Exception as exc:
      logger.error(f"/api/image: failed to read {img_path_resolved}: {exc}")
      raise HTTPException(status_code=500, detail="Failed to read image")

  return Response(content=data, media_type="image/png")

# ---------------------------------------------------------------------
# Mount frontend AFTER defining API routes
# ---------------------------------------------------------------------
frontend_dir = REPO_ROOT / "frontend"
if not frontend_dir.exists():
    logger.warning(f"Frontend directory does not exist: {frontend_dir}")
app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
