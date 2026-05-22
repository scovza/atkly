from pathlib import Path
from PIL import Image

ROOT = Path(__file__).parent.parent
src = ROOT / "favicon.ico"

img = Image.open(src)

# Linux — PNG 256x256
img.resize((256, 256)).save(ROOT / "assets" / "icon.png")

# macOS — ICNS
img.resize((1024, 1024)).save(ROOT / "assets" / "icon.icns")

print("Done — assets/icon.png e assets/icon.icns creati")