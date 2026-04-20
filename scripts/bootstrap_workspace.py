"""
bootstrap_workspace.py - 为 plugin 用户在当前工作区补齐最小运行目录。
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_SOURCE_ROOT = SCRIPT_DIR.parent
if str(PROJECT_SOURCE_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_SOURCE_ROOT))

from scripts.claude_runtime_paths import resolve_runtime_root, resolve_workspace_root


def _copy_tree(src: Path, dst: Path) -> None:
    if not src.exists():
        return

    for source_path in src.rglob("*"):
        if "__pycache__" in source_path.parts or source_path.suffix == ".pyc":
            continue
        relative = source_path.relative_to(src)
        target_path = dst / relative
        if source_path.is_dir():
            target_path.mkdir(parents=True, exist_ok=True)
            continue
        target_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_path, target_path)


def bootstrap_workspace(workspace_root: Path, runtime_root: Path) -> list[Path]:
    created: list[Path] = []

    articles_dir = workspace_root / "articles"
    articles_dir.mkdir(parents=True, exist_ok=True)
    created.append(articles_dir)

    _copy_tree(runtime_root / "styles", workspace_root / ".claude" / "styles")
    _copy_tree(runtime_root / "workflows", workspace_root / ".claude" / "workflows")
    _copy_tree(runtime_root / "scripts", workspace_root / "scripts")

    return created


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="为当前工作区补齐 Writing Agent 最小运行目录")
    parser.add_argument("--workspace-root", help="工作区根目录，默认当前目录")
    parser.add_argument("--runtime-root", help="运行时根目录，默认自动推导")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    workspace_root = resolve_workspace_root(args.workspace_root)
    runtime_root = resolve_runtime_root(
        runtime_root=args.runtime_root,
        workspace_root=workspace_root,
        script_file=__file__,
    )
    created = bootstrap_workspace(workspace_root, runtime_root)
    for path in created:
        print(f"READY {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
