import os
import subprocess
import sys
from pathlib import Path

def main():
    # Determine project root directory (where backend/app.py lives)
    root = Path(__file__).resolve().parents[1]
    app_path = root / "backend" / "app.py"

    if not app_path.exists():
        print("Error: Cannot find backend/app.py")
        sys.exit(1)

    port = os.environ.get("FRB_VIEWER_PORT", "8010")

    print(f"🚀 Launching FRB Viewer on http://127.0.0.1:{port}")

    # Launch uvicorn
    subprocess.run([
        sys.executable,
        "-m",
        "uvicorn",
        "backend.app:app",
        "--reload",
        "--port",
        port
    ], cwd=str(root))

if __name__ == "__main__":
    main()
