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

CHIME_HOST_ROOT = os.getenv("CHIME_HOST_ROOT")
CHIME_HOST_ROOT = Path(CHIME_HOST_ROOT).resolve() if CHIME_HOST_ROOT else None

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

def classify_kind(filename: str, repo: str) -> str:
    """
    Assign a 'kind' label based on filename and repo.

    For chime-path:
      - path-main
      - path-local-stars
      - path-local-nostars
      - path-zoomin
      - other

    For chime-host-analysis:
      - host-ppxf      (e.g. *_ppxf_fit.png)
      - host-spectra   (e.g. *_spectra.png)
      - host-cutout    (e.g. *_arcsec_cutout.png)
      - host-sed       (e.g. *_sed.png — future SED images)
      - other-host
    """
    name = filename.lower()

    # ---- chime-path ----
    if repo == "chime-path":
        if name.endswith("_path.png"):
            return "path-main"
        if "local_stars" in name:
            return "path-local-stars"
        if "local_nostars" in name:
            return "path-local-nostars"
        if "zoomin" in name or "zoom" in name:
            return "path-zoomin"
        return "other"

    # ---- chime-host-analysis ----
    if repo == "chime-host-analysis":
        # pPXF fits
        if "ppxf_fit" in name:
            return "host-ppxf"

        # spectra
        if "spectra" in name:
            return "host-spectra"

        # cutout images (20.0arcsec_cutout, 40.0arcsec_cutout, etc.)
        if "cutout" in name:
            return "host-cutout"

        # SED images (when you start naming like *_sed.png)
        if "sed" in name:
            return "host-sed"

        return "other-host"

    return "other"


def find_images_for_frb(frb_dir: Path, repo: str):
    """
    Return list of image dicts for this FRB in the given repo.
    Each dict has: repo, rel_path, kind, filename.
    rel_path is relative to the repo root.
    """
    images = []
    if repo == "chime-path":
        repo_root = CHIME_PATH_ROOT
    elif repo == "chime-host-analysis":
        repo_root = CHIME_HOST_ROOT
    else:
        return images

    for fn in sorted(frb_dir.glob("*.png")):
        rel = fn.relative_to(repo_root)
        filename = fn.name
        kind = classify_kind(filename, repo)
        images.append(
            {
                "repo": repo,
                "rel_path": str(rel).replace("\\", "/"),
                "filename": filename,
                "kind": kind,
            }
        )
    return images

def attach_host_images(entries):
    """
    If CHIME_HOST_ROOT is set, scan it for PNGs and attach them to
    entries based on FRB IDs found in the path/filename.

    This assumes your host-analysis images include the FRB ID in
    the directory or filename (e.g., FRB20250405B_ppxf.png).
    """
    if CHIME_HOST_ROOT is None or not CHIME_HOST_ROOT.exists():
        return entries

    # Map FRB ID -> entry
    by_id = {e["frb_id"]: e for e in entries}

    # Recursively scan for PNGs under chime-host-analysis
    for fn in CHIME_HOST_ROOT.rglob("*.png"):
        name = fn.name
        full_lower = str(fn).lower()

        # crude FRB ID extraction: look for "frb" followed by 8 digits and a letter
        # adjust if your naming scheme is different
        frb_id = None
        for key in by_id.keys():
            if key.lower() in full_lower:
                frb_id = key
                break

        if frb_id is None:
            continue

        entry = by_id[frb_id]
        repo = "chime-host-analysis"
        rel = fn.relative_to(CHIME_HOST_ROOT)
        kind = classify_kind(name, repo)

        img_info = {
            "repo": repo,
            "rel_path": str(rel).replace("\\", "/"),
            "filename": name,
            "kind": kind,
        }
        entry.setdefault("images", []).append(img_info)

    return entries


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
            images = find_images_for_frb(frb_dir, "chime-path")

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

    # After collecting all PATH entries, attach host-analysis images if available
    entries = attach_host_images(entries)

    out_path = REPO_ROOT / "backend" / "frb_index.json"
    with out_path.open("w") as f:
        json.dump(entries, f, indent=2)

    print(f"Wrote {len(entries)} entries to {out_path}")


if __name__ == "__main__":
    main()
