# FRB Viewer – Architecture Overview

This repo is split into:

- `backend/` – Python FastAPI server
- `frontend/` – static HTML + JS UI
- `docs/` – documentation

## How it works

1. **build_index.py** scans the `chime-path` repo:
   - looks in `chime_path/YYYY/FRB...` directories,
   - finds all `*.png`,
   - parses `*_PATH_candidates.csv` for the top candidate information,
   - classifies each image into a simple `kind` (e.g. `path-main`, `path-zoomin`),
   - writes a single `frb_index.json` file in `backend/`.

2. **app.py** runs a FastAPI web server that:
   - protects all `/api/*` routes with **HTTP Basic Auth** using username/password from `.env`,
   - serves `frb_index.json` at `/api/index`,
   - streams any PNG at `/api/image?repo=chime-path&rel_path=...`,
   - serves the static frontend (`index.html`, `viewer.js`, `style.css`) at `/`.

3. **viewer.js** (in the browser) does:
   - calls `/api/index` to get the list of FRBs and their images,
   - renders a table of FRBs on the left,
   - lets you filter by FRB ID, year, and P_Ox thresholds,
   - when you click a row, shows:
     - summary of the PATH top candidate,
     - a gallery of all images for that FRB,
   - has buttons to show **grid views**:
     - all “main PATH” images (kinds `path-main` and `path-local`) across all filtered FRBs,
     - all “zoom-in PATH” images (kind `path-zoomin`) across all filtered FRBs.

## File-by-file

### backend/build_index.py

- Reads `CHIME_PATH_ROOT` from `.env`.
- Walks `CHIME_PATH_ROOT/chime_path/YYYY/FRB*`.
- For each FRB:
  - `find_images_for_frb()` produces a list of image objects:
    - `repo`: `"chime-path"`
    - `rel_path`: path to the file relative to the repo root
    - `filename`: just the base filename
    - `kind`: simple label based on filename
  - `parse_candidates()` reads the first two rows of `*_PATH_candidates.csv`
    (assuming it is sorted by `P_Ox`), and stores:
    - `top1_pox`, `top2_pox`, `sum_top2_pox`
    - `n_candidates`
    - `top1` candidate details (ra, dec, mag, etc.).
- Writes a list of entries like:

```json
{
  "frb_id": "FRB20250405B",
  "year": "2025",
  "date": "20250405",
  "path": { "top1_pox": 0.93, ... },
  "images": [
    {
      "repo": "chime-path",
      "rel_path": "chime_path/2025/FRB20250405B/FRB20250405B_PATH.png",
      "filename": "FRB20250405B_PATH.png",
      "kind": "path-main"
    },
    ...
  ]
}
