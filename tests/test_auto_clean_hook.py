from __future__ import annotations

import json
import tempfile
import time
import unittest
from pathlib import Path

from scripts import auto_clean_hook as hook_module


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


class AutoCleanHookTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.root = Path(self.tempdir.name)
        self.articles_dir = self.root / "articles"
        self.project_dir = self.articles_dir / "示例项目"
        self.project_dir.mkdir(parents=True, exist_ok=True)

    def tearDown(self) -> None:
        self.tempdir.cleanup()

    def test_auto_clean_hook_never_selects_notes_file(self) -> None:
        write(self.project_dir / "draft_final.md", "# 正文")
        time.sleep(0.05)
        write(self.project_dir / "draft_final_notes.md", "# 备注")

        original_articles_dir = hook_module.ARTICLES_DIR
        try:
            hook_module.ARTICLES_DIR = self.articles_dir
            picked = hook_module.find_latest_draft()
        finally:
            hook_module.ARTICLES_DIR = original_articles_dir

        self.assertEqual((self.project_dir / "draft_final.md").resolve(), picked.resolve())

    def test_manifest_clean_source_has_priority(self) -> None:
        write(self.project_dir / "draft_v3.md", "# 最新正文")
        write(self.project_dir / "draft_final.md", "# 旧终稿")
        write(
            self.project_dir / "run_manifest.json",
            json.dumps(
                {
                    "workflow_version": "collab-v2",
                    "latest_body_file": "draft_v3.md",
                    "clean_source_file": "draft_v3.md",
                    "status": "reviewed",
                },
                ensure_ascii=False,
            ),
        )

        original_articles_dir = hook_module.ARTICLES_DIR
        try:
            hook_module.ARTICLES_DIR = self.articles_dir
            picked = hook_module.resolve_clean_source({})
        finally:
            hook_module.ARTICLES_DIR = original_articles_dir

        self.assertEqual((self.project_dir / "draft_v3.md").resolve(), picked.resolve())

    def test_workspace_root_event_scopes_article_lookup(self) -> None:
        isolated_root = self.root / "workspace-a"
        isolated_articles = isolated_root / "articles"
        isolated_project = isolated_articles / "隔离项目"
        isolated_project.mkdir(parents=True, exist_ok=True)
        write(isolated_project / "draft_final.md", "# 插件工作区正文")

        picked = hook_module.resolve_clean_source({"workspace_root": str(isolated_root)})

        self.assertEqual((isolated_project / "draft_final.md").resolve(), picked.resolve())


if __name__ == "__main__":
    unittest.main()
