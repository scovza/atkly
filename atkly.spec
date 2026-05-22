
# -*- mode: python ; coding: utf-8 -*-
import sys

a = Analysis(
    ["launcher.py"],
    pathex=[],
    binaries=[],
    datas=[
        ("app/templates", "app/templates"),
        ("app/static", "app/static"),
        ("locales", "locales"),
        ("favicon.ico", "."),
    ],
    hiddenimports=["sqlalchemy.dialects.sqlite", "flask_sqlalchemy"],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["pytest", "tkinter"],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="atkly",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    icon="favicon.ico" if sys.platform == "win32" else (
        "assets/icon.icns" if sys.platform == "darwin" else "assets/icon.png"
    ),
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="atkly",
)