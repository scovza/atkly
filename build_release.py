#!/usr/bin/env python3
"""build_release.py — build a standalone Atkly release bundle.

Usage
-----
    python build_release.py              # onedir build (default, faster startup)
    python build_release.py --onefile    # single-file build (slower startup)
    python build_release.py --clean      # wipe dist/ and build/ first

After a successful build, zip dist/atkly/ and upload it to GitHub Releases.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent.resolve()
DIST = ROOT / "dist"
BUILD = ROOT / "build"


def clean() -> None:
    for directory in (DIST, BUILD):
        if directory.exists():
            shutil.rmtree(directory)
            print(f"Removed {directory}")


def build(onefile: bool = False) -> None:
    path_sep = ";" if sys.platform == "win32" else ":"

    if onefile:
        # Single-file mode: drive PyInstaller directly (the .spec defines onedir COLLECT).
        cmd = [
            sys.executable, "-m", "PyInstaller",
            "launcher.py",
            "--noconfirm",
            "--onefile",
            "--name", "atkly",
            "--icon", "favicon.ico",
            "--add-data", f"app/templates{path_sep}app/templates",
            "--add-data", f"app/static{path_sep}app/static",
            "--add-data", f"locales{path_sep}locales",
            "--add-data", f"favicon.ico{path_sep}.",
            "--hidden-import", "sqlalchemy.dialects.sqlite",
            "--hidden-import", "flask_sqlalchemy",
            "--exclude-module", "pytest",
            "--exclude-module", "tkinter",
            "--console",
        ]
    else:
        cmd = [
            sys.executable, "-m", "PyInstaller",
            "atkly.spec",
            "--noconfirm",
        ]

    print("Running:", " ".join(cmd))
    result = subprocess.run(cmd, cwd=ROOT)
    if result.returncode != 0:
        sys.exit(result.returncode)

    output = DIST / "atkly"
    print(f"\nBuild complete: {output}")
    print("Tip: zip dist/atkly/ and upload it to GitHub Releases.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Atkly release bundle")
    parser.add_argument("--onefile", action="store_true", help="Single-file build")
    parser.add_argument("--clean", action="store_true", help="Delete dist/ and build/ first")
    args = parser.parse_args()

    if args.clean:
        clean()

    build(onefile=args.onefile)


if __name__ == "__main__":
    main()
