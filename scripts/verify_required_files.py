"""
verify_required_files.py - 校验项目阶段必需产物是否已真实落盘且非空。
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
ARTICLES_DIR = PROJECT_ROOT / "articles"


def find_file_issues(project_dir: Path, required_files: list[str]) -> list[dict[str, str]]:
    issues: list[dict[str, str]] = []

    for file_name in required_files:
        target = project_dir / file_name
        if not target.exists():
            issues.append({"file": file_name, "reason": "missing"})
            continue

        if not target.is_file() or not target.read_text(encoding="utf-8").strip():
            issues.append({"file": file_name, "reason": "empty"})

    return issues


def verify_required_files(project_dir: Path, required_files: list[str]) -> bool:
    return not find_file_issues(project_dir, required_files)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="校验项目目录中的阶段产物是否存在且非空")
    parser.add_argument("--project", help="articles/ 下的项目目录名")
    parser.add_argument("--project-dir", help="项目绝对路径或相对路径")
    parser.add_argument("--required", nargs="+", required=True, help="必需文件名列表")
    return parser


def resolve_project_dir(args: argparse.Namespace) -> Path:
    if args.project_dir:
        return Path(args.project_dir).resolve()
    if args.project:
        return (ARTICLES_DIR / args.project).resolve()
    raise SystemExit("必须提供 --project 或 --project-dir")


def main() -> int:
    args = build_parser().parse_args()
    project_dir = resolve_project_dir(args)
    issues = find_file_issues(project_dir, args.required)

    if issues:
        print(json.dumps({"project_dir": str(project_dir), "issues": issues}, ensure_ascii=False, indent=2))
        print("FAIL: 存在缺失或空文件")
        return 1

    print(
        json.dumps(
            {"project_dir": str(project_dir), "required": args.required, "status": "ok"},
            ensure_ascii=False,
            indent=2,
        )
    )
    print("PASS: 必需产物已落盘")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
