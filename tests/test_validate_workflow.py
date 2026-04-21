from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from scripts.validate_workflow import validate_repo


CONTRACT = {
    "workflow_version": "collab-v2",
    "legacy_aliases": {
        "02_cases.md": "02_scar_tissue.md",
        "04_empathy_map.md": "04_share_map.md",
    },
    "stages": [
        {"id": "3", "agent": "outline-architect", "outputs": ["03_outline.md"]},
        {"id": "5", "agent": "concretizer", "outputs": ["05_concrete_library.md"]},
    ],
}


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


class ValidateWorkflowTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.root = Path(self.tempdir.name)

        write(self.root / ".claude/workflows/collab_v2.json", json.dumps(CONTRACT, ensure_ascii=False))
        write(self.root / "claude-runtime/workflows/collab_v2.json", json.dumps(CONTRACT, ensure_ascii=False))
        write(self.root / ".claude/skills/工作流导演/SKILL.md", "# workflow\n03_outline.md\n05_concrete_library.md\n")
        write(self.root / "claude-runtime/skills/工作流导演/SKILL.md", "# workflow\n03_outline.md\n05_concrete_library.md\n")
        write(self.root / "README.md", "# readme\n")
        write(self.root / "articles/README.md", "# articles\n")
        write(self.root / "docs/WORKFLOW_QUICK_REFERENCE.md", "# quick reference\n")
        write(self.root / "docs/PROJECT_STRUCTURE.md", "# project structure\n")

    def tearDown(self) -> None:
        self.tempdir.cleanup()

    def test_rejects_legacy_artifacts_in_active_agents(self) -> None:
        write(
            self.root / ".claude/agents/outline-architect.md",
            "读取 02_cases.md\n输出 03_outline.md\n",
        )
        write(
            self.root / ".claude/agents/concretizer.md",
            "读取 04_share_map.md\n输出 05_concrete_library.md\n",
        )

        report = validate_repo(self.root, "active")

        self.assertTrue(report["errors"])
        self.assertTrue(any("02_cases.md" in issue.message for issue in report["errors"]))

    def test_allows_legacy_artifacts_under_articles_samples(self) -> None:
        write(
            self.root / ".claude/agents/outline-architect.md",
            "读取 01_theme.md\n输出 03_outline.md\n",
        )
        write(
            self.root / ".claude/agents/concretizer.md",
            "读取 04_share_map.md\n输出 05_concrete_library.md\n",
        )
        write(self.root / "articles/示例/03_outline.md", "历史说明：来源 02_cases.md\n")

        report = validate_repo(self.root, "all")

        self.assertFalse(report["errors"])
        self.assertTrue(report["warnings"])
        self.assertTrue(any("legacy" in issue.message for issue in report["warnings"]))

    def test_requires_v2_outputs_for_stage_agents(self) -> None:
        write(
            self.root / ".claude/agents/outline-architect.md",
            "这里只有旧说明，没有输出声明\n",
        )
        write(
            self.root / ".claude/agents/concretizer.md",
            "输出 05_concrete_library.md\n",
        )

        report = validate_repo(self.root, "active")

        self.assertTrue(any("03_outline.md" in issue.message for issue in report["errors"]))

    def test_can_validate_against_claude_runtime_assets(self) -> None:
        write(
            self.root / "claude-runtime/agents/outline-architect.md",
            "读取 01_theme.md\n输出 03_outline.md\n",
        )
        write(
            self.root / "claude-runtime/agents/concretizer.md",
            "读取 04_share_map.md\n输出 05_concrete_library.md\n",
        )

        report = validate_repo(self.root, "active", runtime_root=self.root / "claude-runtime")

        self.assertFalse(report["errors"])


if __name__ == "__main__":
    unittest.main()
