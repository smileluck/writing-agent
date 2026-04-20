from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from scripts.check_claude_runtime_sync import find_runtime_drift
from scripts.sync_claude_runtime import sync_runtime_assets


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


class ClaudeRuntimeSyncTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.root = Path(self.tempdir.name)
        self.runtime_root = self.root / "claude-runtime"

        write(self.runtime_root / "agents" / "writing-executor.md", "# agent\n")
        write(self.runtime_root / "skills" / "工作流导演" / "SKILL.md", "# skill\n")
        write(self.runtime_root / "styles" / "jiubian.md", "# style\n")
        write(self.runtime_root / "workflows" / "collab_v2.json", json.dumps({"stages": []}, ensure_ascii=False))
        write(self.runtime_root / "hooks" / "hooks.json", json.dumps({"hooks": {}}, ensure_ascii=False))
        write(self.runtime_root / "scripts" / "init_workspace.py", "print('ok')\n")
        write(self.runtime_root / "templates" / "README.md", "# template\n")

    def tearDown(self) -> None:
        self.tempdir.cleanup()

    def test_sync_copies_runtime_assets_to_both_targets(self) -> None:
        sync_runtime_assets(self.root)

        self.assertTrue((self.root / ".claude" / "agents" / "writing-executor.md").exists())
        self.assertTrue((self.root / "plugins" / "writing-agent" / "agents" / "writing-executor.md").exists())
        self.assertTrue((self.root / "plugins" / "writing-agent" / ".claude-plugin" / "plugin.json").exists())
        self.assertTrue((self.root / ".claude-plugin" / "marketplace.json").exists())

    def test_check_reports_drift_when_consumer_differs(self) -> None:
        sync_runtime_assets(self.root)
        write(self.root / ".claude" / "agents" / "writing-executor.md", "# changed\n")

        drift = find_runtime_drift(self.root)

        self.assertTrue(any(".claude/agents/writing-executor.md" in item for item in drift))


if __name__ == "__main__":
    unittest.main()
