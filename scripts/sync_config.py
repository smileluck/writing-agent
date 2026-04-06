"""
sync_config.py - 写作Agent配置同步工具

将 .kilo/ 作为单一数据源，单向同步到 .trae/ 和 .claude/

用法：
  python scripts/sync_config.py          # 完整同步（默认）
  python scripts/sync_config.py --dry-run # 预览模式，不写入文件
  python scripts/sync_config.py --skills  # 只同步 skills
  python scripts/sync_config.py --agents  # 只同步 agents
  python scripts/sync_config.py --styles  # 只同步 styles

同步方向：.kilo/ → .trae/ + .claude/
路径映射：
  .kilo/skill/    → .trae/skills/    （Trae 格式）
                  → .claude/skills/  （Claude Code 格式）
  .kilo/agent/    → .claude/agents/  （Claude Code 格式）
  .kilo/styles/   → .claude/styles/  （Claude Code 格式）

路径引用替换：
  .kilo/styles/   → .claude/styles/  （同步到 .claude 时）
  .kilo/skill/    → .claude/skills/  （同步到 .claude 时）
"""

import os
import sys
import shutil
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KILO_SKILL = ROOT / ".kilo" / "skill"
KILO_AGENT = ROOT / ".kilo" / "agent"
KILO_STYLES = ROOT / ".kilo" / "styles"

TRAE_SKILLS = ROOT / ".trae" / "skills"
CLAUDE_SKILLS = ROOT / ".claude" / "skills"
CLAUDE_AGENTS = ROOT / ".claude" / "agents"
CLAUDE_STYLES = ROOT / ".claude" / "styles"


def replace_path_refs(content: str, target: str) -> str:
    if target == "trae":
        return content
    if target == "claude":
        content = content.replace(".kilo/styles/", ".claude/styles/")
        content = content.replace(".kilo/skill/", ".claude/skills/")
        return content
    return content


def convert_agent_to_claude(content: str) -> str:
    import re

    match = re.match(r"^---\n(.*?)\n---\n(.*)$", content, re.DOTALL)
    if not match:
        return content
    fm_text = match.group(1)
    body = match.group(2)
    desc = re.search(r"^description:\s*(.+?)$", fm_text, re.MULTILINE)
    desc_val = desc.group(1).strip() if desc else ""
    name_from_heading = re.search(r"^#\s+(.+)$", body, re.MULTILINE)
    name_val = ""
    if name_from_heading:
        heading = name_from_heading.group(1)
        for part in heading.split():
            if part.isascii() and len(part) > 2:
                name_val = part.lower().replace(":", "").replace(",", "")
                break
    new_fm = f"---\nname: {name_val}\ndescription: {desc_val}\ntools: Read, Write, Bash, Glob, Grep\nmodel: sonnet\n---"
    return new_fm + "\n" + body


def sync_dir(src: Path, dst: Path, target: str, transform=None):
    if not src.exists():
        print(f"  SKIP: {src} not found")
        return 0
    count = 0
    dst.mkdir(parents=True, exist_ok=True)
    for item in src.iterdir():
        dst_item = dst / item.name
        if item.is_dir():
            if dst_item.exists():
                shutil.rmtree(dst_item)
            shutil.copytree(item, dst_item)
            for md in dst_item.rglob("*.md"):
                text = md.read_text(encoding="utf-8")
                new_text = replace_path_refs(text, target)
                if transform:
                    new_text = transform(new_text)
                md.write_text(new_text, encoding="utf-8")
            count += 1
            print(f"  {item.name}/ → {dst_item}")
        elif item.is_file():
            text = item.read_text(encoding="utf-8")
            new_text = replace_path_refs(text, target)
            if transform:
                new_text = transform(new_text)
            dst_item.write_text(new_text, encoding="utf-8")
            count += 1
            print(f"  {item.name} → {dst_item}")
    return count


def main():
    parser = argparse.ArgumentParser(
        description="Sync .kilo/ config to .trae/ and .claude/"
    )
    parser.add_argument("--dry-run", action="store_true", help="Preview only")
    parser.add_argument("--skills", action="store_true", help="Sync skills only")
    parser.add_argument("--agents", action="store_true", help="Sync agents only")
    parser.add_argument("--styles", action="store_true", help="Sync styles only")
    args = parser.parse_args()

    do_all = not (args.skills or args.agents or args.styles)

    print(f"Root: {ROOT}")
    print(f"Dry run: {args.dry_run}\n")

    if args.dry_run:
        print("(DRY RUN - no files will be written)\n")

    total = 0

    if do_all or args.skills:
        print("=== Syncing Skills ===")
        if not args.dry_run:
            print("  → .trae/skills/")
            total += sync_dir(KILO_SKILL, TRAE_SKILLS, "trae")
            print("  → .claude/skills/")
            total += sync_dir(KILO_SKILL, CLAUDE_SKILLS, "claude")

    if do_all or args.agents:
        print("\n=== Syncing Agents ===")
        if not args.dry_run:
            print("  → .claude/agents/")
            total += sync_dir(
                KILO_AGENT, CLAUDE_AGENTS, "claude", transform=convert_agent_to_claude
            )

    if do_all or args.styles:
        print("\n=== Syncing Styles ===")
        if not args.dry_run:
            print("  → .claude/styles/")
            total += sync_dir(KILO_STYLES, CLAUDE_STYLES, "claude")

    print(f"\nDone. Total items synced: {total}")


if __name__ == "__main__":
    main()
