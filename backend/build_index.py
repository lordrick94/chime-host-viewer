#!/usr/bin/env python
"""
Scan the chime-path repo and build frb_index.json for the viewer.

Later you can extend this script to also scan chime-host-analysis and attach
extra images per FRB.
"""

import os
import csv
import json
from pathlib import Path
from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(REPO_ROOT / ".env")

CHIME_PATH_ROOT = os.getenv("CHIME_PATH_ROOT")
if CHIME_PATH_ROOT is None:
    raise SystemExit("CHIME_PATH_ROOT is not set in .env")

CHIME_PATH_ROOT = Path(CHIME_PATH_ROOT).resolve()

# Inside chime-path, your structure is chime_path/YYYY/FRB...
CHIME_PATH_DATA = CHIME_PATH_ROOT / "chime_path"

YEARS = ["2022", "2023", "2024", "2025"]


def _to_float(v):
    if v is None:
        return None
    s = str(v).strip()
    if s == "":
        return None
    try:
        return float(s)
    except ValueError:
        return None


def classify_kind(filename: str) -> str:
    """
    Assign a simple 'kind' label based on the filename.
    This helps the JS decide what to show in main/zoomin grids.
    """
    name = filename.lower()
    if name.endswith("_path.png"):
        return "path-main"
    if "local_stars" in name or "local_nostars" in name:
        return "path-local"
    if "zoomin" in name or "zoom" in name:
        return "path-zoomin"
    # TODO: extend for spectra / ppxf / sed from other repos
    return "other"


def find_images_for_frb(frb_dir: Path):
    """
    Return list of image dicts for this FRB in chime-path.
    Each dict has: repo, rel_path, kind, filename.
    rel_path is relative to CHIME_PATH_ROOT.
    """
    images = []
    for fn in sorted(frb_dir.glob("*.png")):
        rel = fn.relative_to(CHIME_PATH_ROOT)  # e.g. chime_path/2025/FRB.../file.png
        filename = fn.name
        kind = classify_kind(filename)
        images.append(
            {
                "repo": "chime-path",
                "rel_path": str(rel).replace("\\", "/"),
                "filename": filename,
                "kind": kind,
            }
        )
    return images


def parse_candidates(csv_path: Path):
    """
    Read *_PATH_candidates.csv to extract:
      - top1_pox
      - top2_pox
      - sum_top2_pox
      - n_candidates
      - top1 candidate details
    Assumes file is sorted by P_Ox descending.
    """
    if not csv_path.exists():
        return {}

    n_candidates = 0
    top1 = None
    top2 = None

    with csv_path.open(newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            n_candidates += 1
            if n_candidates == 1:
                top1 = row
            elif n_candidates == 2:
                top2 = row
            # keep looping so we know n_candidates

    if n_candidates == 0 or top1 is None:
        return {}

    top1_pox = _to_float(top1.get("P_Ox"))
    top2_pox = _to_float(top2.get("P_Ox")) if top2 is not None else None
    if top1_pox is not None and top2_pox is not None:
        sum_top2_pox = top1_pox + top2_pox
    else:
        sum_top2_pox = top1_pox

    top1_details = {
        "ra": _to_float(top1.get("ra")),
        "dec": _to_float(top1.get("dec")),
        "ang_size": _to_float(top1.get("ang_size")),
        "mag": _to_float(top1.get("mag")),
        "id": top1.get("ID"),
        "sep": _to_float(top1.get("sep")),
        "p_o": _to_float(top1.get("P_O")),
        "p_xo": _to_float(top1.get("p_xO")),
        "p_ox": top1_pox,
        "p_ux": _to_float(top1.get("P_Ux")),
        "z_phot_median": _to_float(top1.get("z_phot_median")),
        "z_spec": _to_float(top1.get("z_spec")),
        "survey": top1.get("survey"),
    }

    return {
        "best_score": top1_pox,
        "top1_pox": top1_pox,
        "top2_pox": top2_pox,
        "sum_top2_pox": sum_top2_pox,
        "n_candidates": n_candidates,
        "top1": top1_details,
    }


def main():
    entries = []

    for year in YEARS:
        year_dir = CHIME_PATH_DATA / year
        if not year_dir.exists():
            continue

        for frb_dir in sorted(year_dir.glob("FRB*")):
            if not frb_dir.is_dir():
                continue

            frb_id = frb_dir.name  # e.g. FRB20250405B
            images = find_images_for_frb(frb_dir)

            candidates_csv = next(frb_dir.glob("*_PATH_candidates.csv"), None)
            path_info = parse_candidates(candidates_csv) if candidates_csv else {}

            entry = {
                "frb_id": frb_id,
                "year": year,
                "date": frb_id[3:11] if len(frb_id) >= 11 else None,
                "path": path_info,
                "images": images,
            }

            entries.append(entry)

    out_path = REPO_ROOT / "backend" / "frb_index.json"
    with out_path.open("w") as f:
        json.dump(entries, f, indent=2)

    print(f"Wrote {len(entries)} entries to {out_path}")


if __name__ == "__main__":
    main()
