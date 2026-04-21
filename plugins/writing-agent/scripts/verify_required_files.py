"""
verify_required_files.py - 校验项目阶段必需产物是否已真实落盘且非空。
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_SOURCE_ROOT = SCRIPT_DIR.parent
if str(PROJECT_SOURCE_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_SOURCE_ROOT))

from scripts.claude_runtime_paths import workspace_articles_dir


ARTICLES_DIR = workspace_articles_dir()


def title_file_is_locked(content: str) -> bool:
    lines = content.splitlines()

    for raw_line in lines:
        normalized = raw_line.strip().replace("**", "")
        if "选择状态" in normalized and "待定" in normalized:
            return False
        if "最终标题" in normalized and ("：" in normalized or ":" in normalized):
            value = re.split(r"[:：]", normalized, maxsplit=1)[1].strip().strip("*").strip()
            if not value or value == "待定":
                return False
            return True

    for index, raw_line in enumerate(lines):
        if "## 最终标题" not in raw_line:
            continue

        for candidate in lines[index + 1 : index + 7]:
            stripped = candidate.strip()
            if not stripped:
                continue
            normalized = stripped.replace("**", "")
            if "待定" in normalized:
                return False
            if "「" in normalized and "」" in normalized:
                return True

    return False


def find_file_issues(project_dir: Path, required_files: list[str]) -> list[dict[str, str]]:
    issues: list[dict[str, str]] = []

    for file_name in required_files:
        target = project_dir / file_name
        if not target.exists():
            issues.append({"file": file_name, "reason": "missing"})
            continue

        if not target.is_file():
            issues.append({"file": file_name, "reason": "empty"})
            continue

        content = target.read_text(encoding="utf-8")
        if not content.strip():
            issues.append({"file": file_name, "reason": "empty"})
            continue

        if file_name == "04_title.md" and not title_file_is_locked(content):
            issues.append({"file": file_name, "reason": "unlocked_title"})

    return issues


def verify_required_files(project_dir: Path, required_files: list[str]) -> bool:
    return not find_file_issues(project_dir, required_files)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="校验项目目录中的阶段产物是否存在且非空")
    parser.add_argument("--workspace-root", help="工作区根目录，默认当前目录")
    parser.add_argument("--project", help="articles/ 下的项目目录名")
    parser.add_argument("--project-dir", help="项目绝对路径或相对路径")
    parser.add_argument("--required", nargs="+", required=True, help="必需文件名列表")
    return parser


def resolve_project_dir(args: argparse.Namespace) -> Path:
    if args.project_dir:
        return Path(args.project_dir).resolve()
    if args.project:
        return (workspace_articles_dir(args.workspace_root) / args.project).resolve()
    raise SystemExit("必须提供 --project 或 --project-dir")


def main() -> int:
    args = build_parser().parse_args()
    project_dir = resolve_project_dir(args)
    issues = find_file_issues(project_dir, args.required)

    if issues:
        print(json.dumps({"project_dir": str(project_dir), "issues": issues}, ensure_ascii=False, indent=2))
        print("FAIL: 存在缺失、空文件或未锁定标题")
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
