#!/usr/bin/env python

"""
Builds:
  1. frb_index.json  - per-FRB summary used by the viewer.
  2. path_table.json - flat PATH candidate table for dynamic plots.
"""

import csv
import json
import os
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

# ---------------------------------------------------------------------
# Logging Setup
# ---------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)   # LOG

# ---------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(REPO_ROOT / ".env")

CHIME_PATH_ROOT_ENV = os.getenv("CHIME_PATH_ROOT")
CHIME_HOST_ROOT_ENV = os.getenv("CHIME_HOST_ROOT")

if not CHIME_PATH_ROOT_ENV:
    logger.error("CHIME_PATH_ROOT is not set in .env")   # LOG
    raise SystemExit("CHIME_PATH_ROOT is not set in .env")

CHIME_PATH_ROOT = Path(CHIME_PATH_ROOT_ENV).expanduser().resolve()

if not CHIME_PATH_ROOT.exists():
    logger.error(f"CHIME_PATH_ROOT does not exist: {CHIME_PATH_ROOT}")  # LOG
    raise SystemExit(f"CHIME_PATH_ROOT does not exist: {CHIME_PATH_ROOT}")

if CHIME_HOST_ROOT_ENV:
    CHIME_HOST_ROOT = Path(CHIME_HOST_ROOT_ENV).expanduser().resolve()
    if not CHIME_HOST_ROOT.exists():
        logger.warning(f"CHIME_HOST_ROOT does not exist: {CHIME_HOST_ROOT}")  # LOG
        CHIME_HOST_ROOT = None
else:
    CHIME_HOST_ROOT = None

OUTPUT_INDEX_PATH = REPO_ROOT / "backend" / "frb_index.json"
OUTPUT_PATH_TABLE_PATH = REPO_ROOT / "backend" / "path_table.json"  # NEW

# ---------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------

def safe_float(row: Dict[str, Any], *keys: str) -> Optional[float]:
    for key in keys:
        if key in row and row[key] not in ("", None):
            try:
                return float(row[key])
            except ValueError:
                continue
    return None


def find_path_root_dir() -> Path:
    candidate = CHIME_PATH_ROOT / "chime_path"
    if candidate.exists():
        return candidate
    return CHIME_PATH_ROOT


def iter_year_dirs(root: Path):
    for p in sorted(root.iterdir()):
        if p.is_dir() and p.name.isdigit():
            yield p


def iter_frb_dirs(year_dir: Path):
    for p in sorted(year_dir.iterdir()):
        if p.is_dir() and p.name.upper().startswith("FRB"):
            yield p


def find_path_csv(frb_dir: Path) -> Optional[Path]:
    matches = list(frb_dir.glob("*PATH*candidate*.csv")) + list(
        frb_dir.glob("*PATH*candidates*.csv")
    )
    if not matches:
        return None
    return sorted(matches)[0]


def classify_path_image(path: Path) -> str:
    name = path.name.lower()
    if "zoom" in name:
        return "path-zoomin"
    if "nostars" in name:
        return "path-local-nostars"
    if "stars" in name:
        return "path-local-stars"
    if "path" in name:
        return "path-main"
    return "other"


# ---------------------------------------------------------------------
# NEW: Candidate Extraction
# ---------------------------------------------------------------------

def extract_candidates_from_csv(
    frb_id: str, csv_path: Path
) -> List[Dict[str, Any]]:
    candidates: List[Dict[str, Any]] = []

    with csv_path.open(newline="") as f:
        reader = csv.DictReader(f)

        for i, row in enumerate(reader, start=1):
            mag = safe_float(row, "MAG", "mag", "MAG_R", "rmag", "r_mag")
            pox = safe_float(row, "P_Ox", "P_OX", "POX")
            po = safe_float(row, "P_O", "PO")
            pxo = safe_float(row, "P_XO", "Pxo")
            z_phot = safe_float(row, "Z_PHOT", "Z_PHOT_MEDIAN")
            z_spec = safe_float(row, "Z_SPEC")

            candidate = {
                "frb_id": frb_id,
                "cand_id": i,
                "mag": mag,
                "pox": pox,
                "po": po,
                "pxo": pxo,
                "survey": row.get("SURVEY") or None,
                "z_phot": z_phot,
                "z_spec": z_spec,
            }

            sep = safe_float(row, "SEP", "Separation", "sep_arcsec")
            if sep is not None:
                candidate["sep"] = sep

            candidates.append(candidate)

    return candidates


# ---------------------------------------------------------------------
# Main build function
# ---------------------------------------------------------------------

def build_index() -> None:
    path_root = find_path_root_dir()

    all_entries = []
    all_candidates = []   # NEW

    logger.info(f"Scanning PATH repo at {path_root}")   # LOG

    for year_dir in iter_year_dirs(path_root):
        year = year_dir.name
        logger.info(f"Scanning year {year}")   # LOG

        for frb_dir in iter_frb_dirs(year_dir):
            frb_id = frb_dir.name
            logger.info(f"  FRB {frb_id}")     # LOG

            entry = {
                "frb_id": frb_id,
                "year": year,
                "date": None,
                "path": {},
                "host": {},
                "images": [],
            }

            # Extract date if possible
            if frb_id.upper().startswith("FRB") and len(frb_id) >= 11:
                maybe_date = frb_id[3:11]
                if maybe_date.isdigit():
                    entry["date"] = maybe_date

            # ---------------------------------------------------------
            # Collect PATH images
            # ---------------------------------------------------------
            for img_path in sorted(frb_dir.glob("*.png")):
                kind = classify_path_image(img_path)
                rel = img_path.relative_to(CHIME_PATH_ROOT)

                entry["images"].append(
                    {
                        "repo": "chime-path",
                        "rel_path": str(rel),
                        "filename": img_path.name,
                        "kind": kind,
                    }
                )

            # ---------------------------------------------------------
            # Read PATH CSV
            # ---------------------------------------------------------
            csv_path = find_path_csv(frb_dir)

            if csv_path:
                try:
                    with csv_path.open(newline="") as f:
                        reader = csv.DictReader(f)
                        rows = list(reader)
                except Exception as exc:
                    logger.warning(f"Failed to read {csv_path}: {exc}")  # LOG
                    rows = []

                if rows:
                    # Used for FRB-level summary
                    best_pox = -1
                    best_row = None

                    for row in rows:
                        pox_val = safe_float(row, "P_Ox", "P_OX", "POX")
                        if pox_val is not None and pox_val > best_pox:
                            best_pox = pox_val
                            best_row = row

                    if best_row is not None:
                        top1 = {}
                        top1["mag"] = safe_float(best_row, "MAG", "MAG_R", "mag")
                        top1["pox"] = best_pox
                        top1["po"] = safe_float(best_row, "P_O", "PO")
                        top1["pxo"] = safe_float(best_row, "P_XO", "Pxo")
                        top1["survey"] = best_row.get("SURVEY") or None
                        top1["z_phot_median"] = safe_float(
                            best_row, "Z_PHOT_MEDIAN", "Z_PHOT"
                        )
                        top1["z_spec"] = safe_float(best_row, "Z_SPEC")

                        entry["path"]["top1"] = top1
                        entry["path"]["top1_pox"] = best_pox

                        # Sum top 2 P_Ox
                        pox_vals = [
                            safe_float(r, "P_Ox", "P_OX", "POX")
                            for r in rows
                            if safe_float(r, "P_Ox", "P_OX", "POX") is not None
                        ]
                        pox_vals.sort(reverse=True)

                        if len(pox_vals) >= 2:
                            entry["path"]["sum_top2_pox"] = (
                                pox_vals[0] + pox_vals[1]
                            )
                        elif len(pox_vals) == 1:
                            entry["path"]["sum_top2_pox"] = pox_vals[0]
                        else:
                            entry["path"]["sum_top2_pox"] = None

                        entry["path"]["n_candidates"] = len(rows)

                    # -------- NEW: Extract candidate rows --------
                    candidate_rows = extract_candidates_from_csv(
                        frb_id, csv_path
                    )
                    all_candidates.extend(candidate_rows)
            else:
                logger.info(f"    No PATH CSV found for {frb_id}")  # LOG

            # ---------------------------------------------------------
            # Attach HOST images if available
            # ---------------------------------------------------------
            if CHIME_HOST_ROOT:
                for p in CHIME_HOST_ROOT.rglob("*.png"):
                    if frb_id in p.name:
                        entry["images"].append(
                            {
                                "repo": "chime-host-analysis",
                                "rel_path": str(p.relative_to(CHIME_HOST_ROOT)),
                                "filename": p.name,
                                "kind": "host-other",
                            }
                        )

            all_entries.append(entry)

    # -----------------------------------------------------------------
    # Write outputs
    # -----------------------------------------------------------------
    logger.info(f"Writing FRB index to {OUTPUT_INDEX_PATH}")   # LOG
    OUTPUT_INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_INDEX_PATH.open("w") as f:
        json.dump(all_entries, f, indent=2)

    logger.info(f"Writing PATH candidate table to {OUTPUT_PATH_TABLE_PATH}")  # LOG
    OUTPUT_PATH_TABLE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH_TABLE_PATH.open("w") as f:
        json.dump(all_candidates, f, indent=2)

    logger.info("Done building index and path_table")  # LOG


if __name__ == "__main__":
    build_index()
