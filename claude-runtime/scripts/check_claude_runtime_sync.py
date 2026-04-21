"""
check_claude_runtime_sync.py - 检查 claude-runtime 与消费端目录是否漂移。
"""

from __future__ import annotations

import hashlib
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
RUNTIME_ROOT = PROJECT_ROOT / "claude-runtime"

SYNC_TARGETS = {
    "agents": [Path(".claude/agents"), Path("plugins/writing-agent/agents")],
    "skills": [Path(".claude/skills"), Path("plugins/writing-agent/skills")],
    "styles": [Path(".claude/styles"), Path("plugins/writing-agent/styles")],
    "workflows": [Path(".claude/workflows"), Path("plugins/writing-agent/workflows")],
    "scripts": [Path("scripts"), Path("plugins/writing-agent/scripts")],
}


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def find_runtime_drift(project_root: Path = PROJECT_ROOT) -> list[str]:
    runtime_root = project_root / "claude-runtime"
    drift: list[str] = []

    for directory, targets in SYNC_TARGETS.items():
        source_dir = runtime_root / directory
        if not source_dir.exists():
            continue

        for source_path in source_dir.rglob("*"):
            if not source_path.is_file():
                continue
            if "__pycache__" in source_path.parts or source_path.suffix == ".pyc":
                continue
            relative = source_path.relative_to(source_dir)
            source_hash = _sha256(source_path)

            for target_root in targets:
                target_path = project_root / target_root / relative
                if not target_path.exists():
                    drift.append(f"missing: {target_root.as_posix()}/{relative.as_posix()}")
                    continue
                if _sha256(target_path) != source_hash:
                    drift.append(f"changed: {target_root.as_posix()}/{relative.as_posix()}")

    return drift


def main() -> int:
    drift = find_runtime_drift(PROJECT_ROOT)
    if drift:
        for item in drift:
            print(item)
        print(f"FAIL: 共 {len(drift)} 处漂移")
        return 1

    print("PASS: claude-runtime 与消费端目录一致")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
