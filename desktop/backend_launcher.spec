# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path
import sys

from PyInstaller.utils.hooks import collect_submodules


desktop_dir = Path(SPECPATH).resolve()
repo_root = desktop_dir.parent
backend_dir = repo_root / "backend"
sys.path.insert(0, str(backend_dir))

hiddenimports = (
    collect_submodules("app")
    + collect_submodules("sqlmodel")
    + collect_submodules("sqlalchemy")
    + collect_submodules("uvicorn")
)

a = Analysis(
    ["backend_launcher.py"],
    pathex=[str(desktop_dir), str(backend_dir)],
    binaries=[],
    datas=[],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="anilysis-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
