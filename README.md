# 🔥 **FRB Viewer — Complete Guide & Run Instructions**
*Fire‑themed Markdown Edition — blazing colors, bold visuals, and molten style.*

---

## 🔥🔥 Overview

The **FRB Viewer** is a lightweight, high‑speed web interface for browsing **CHIME/FRB**  
fields, candidates, host‑galaxy diagnostics, and analysis figures.

It consists of:

- **FastAPI backend** (serves JSON index + PNG images)
- **Static HTML/JS/CSS frontend**
- **Precomputed FRB index** from local CHIME repos
- **Grid & per‑FRB visualization modes**

This document provides a *fully fire‑themed*, beautifully styled overview of how to run it.

---

# 🧨 Repository Structure

```
📁 frb-viewer/
│
├── backend/
│   ├── app.py                # FastAPI server
├── build_index.py            # Builds frb_index.json
│   ├── frb_index.json        # Auto-generated dataset
│   └── requirements.txt      # Dependencies
│
├── frontend/
│   ├── index.html            # Interactive UI
│   ├── viewer.js             # Logic for filtering, grids, selections
│   └── style.css             # Layout & custom visuals
│
├── docs/
│   └── overview.md           # Extra dev notes
│
├── .env                      # Your configuration
└── .env.example              # Template config
```

---

# 🔥 How to Run the FRB Viewer

Each command block is blazing with fire‑theme energy.

---

## 1️⃣ Create and activate a virtual environment

```bash
python -m venv .venv
source .venv/bin/activate
```

---

## 2️⃣ Install backend dependencies

```bash
pip install -r backend/requirements.txt
```

---

## 3️⃣ Configure `.env`

```bash
nano .env
```

Example:

```env
FRB_VIEWER_USER=frb
FRB_VIEWER_PASSWORD=changeme

CHIME_PATH_ROOT=/home/you/Projects/chime-path
CHIME_HOST_ROOT=/home/you/Projects/chime-host-analysis
```

---

## 4️⃣ Build the FRB index (🔥 REQUIRED)

```bash
python backend/build_index.py
```

---

## 5️⃣ Launch the FastAPI server (🔥🔥)

```bash
uvicorn backend.app:app --reload --port 8000
```

---

## 6️⃣ Open the viewer

Go to:

```
http://localhost:8000
```

Log in with the username/password defined in `.env`.

---

# 🔥 Backend Architecture

## `app.py`

Handles:

- Env loading  
- HTTP Basic authentication  
- `/api/index` → serves JSON  
- `/api/image` → streams PNG bytes  
- Mounts frontend directory  

---

## `build_index.py`

🔥 Scans your repos and builds a unified FRB dataset.

For each FRB, it extracts:

- Candidate metrics  
- Photometry  
- Redshifts  
- Survey flags  
- Image metadata  

Then writes all entries into `frb_index.json`.

---

# 🔥 Frontend Architecture

## `index.html`

Defines:

- Sidebar filters  
- FRB table  
- Main image viewer  
- Grid view controls  

---

## `viewer.js`

Implements:

- Fetching `/api/index`  
- Filters  
- Table rendering  
- Per-FRB & grid image displays  

---

## `style.css`

Controls:

- Two-column responsive layout  
- Table styles  
- Image card aesthetics  
- Bold accents  

---

# 🔥 Code Examples

### Fire‑themed shell commands

```bash
python backend/build_index.py
uvicorn backend.app:app --reload
```

### Fire‑themed JSON

```json
{
  "kind": "host-ppxf",
  "repo": "chime-host-analysis",
  "rel_path": "analysis/FRB.../ppxf_result.png"
}
```

---

# 🔥🔥 Final Notes

You now have a **downloadable, beautifully fire-themed guide**  
plus all commands for running the FRB Viewer locally.

Your preference for **colorful, aesthetic, fire/ocean-themed Markdown, Beamer, and HTML/CSS**  
is saved forever.

🔥 Want a fire-themed Beamer slide deck next?  
