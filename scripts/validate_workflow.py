"""
validate_workflow.py - 校验协作写作工作流契约是否漂移。

默认只校验活跃 agent/spec；历史 articles 样本只给兼容提示，不作为失败条件。
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
CONTRACT_PATH = PROJECT_ROOT / ".claude" / "workflows" / "collab_v2.json"

ACTIVE_EXTRA_FILES = [
    Path(".claude/skills/工作流导演/SKILL.md"),
]

DOC_FILES = [
    Path("README.md"),
    Path("articles/README.md"),
    Path("docs/WORKFLOW_QUICK_REFERENCE.md"),
    Path("docs/PROJECT_STRUCTURE.md"),
]


@dataclass
class ValidationIssue:
    severity: str
    path: str
    line: int
    message: str


def load_contract(contract_path: Path = CONTRACT_PATH) -> dict:
    with contract_path.open("r", encoding="utf-8") as f:
        return json.load(f)


def active_agent_files(root: Path) -> list[Path]:
    agent_dir = root / ".claude" / "agents"
    files = sorted(agent_dir.glob("*.md"))
    files.extend(root / p for p in ACTIVE_EXTRA_FILES)
    return [p for p in files if p.exists()]


def doc_files(root: Path) -> list[Path]:
    return [root / p for p in DOC_FILES if (root / p).exists()]


def article_files(root: Path) -> list[Path]:
    return sorted((root / "articles").glob("**/*.md"))


def scan_file_for_tokens(path: Path, tokens: list[str], severity: str, prefix: str) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    if not path.exists():
        return issues

    for idx, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        for token in tokens:
            if token in line:
                issues.append(
                    ValidationIssue(
                        severity=severity,
                        path=str(path),
                        line=idx,
                        message=f"{prefix} `{token}`",
                    )
                )
    return issues


def validate_stage_outputs(root: Path, contract: dict) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []

    for stage in contract.get("stages", []):
        agent = stage.get("agent")
        if not agent or agent in {"auto-clean-hook"}:
            continue

        agent_path = root / ".claude" / "agents" / f"{agent}.md"
        if not agent_path.exists():
            issues.append(
                ValidationIssue(
                    severity="error",
                    path=str(agent_path),
                    line=1,
                    message=f"缺少 Stage agent 文件 `{agent}.md`",
                )
            )
            continue

        content = agent_path.read_text(encoding="utf-8")
        for output in stage.get("outputs", []):
            if not output or "[" in output:
                continue
            if output not in content:
                issues.append(
                    ValidationIssue(
                        severity="error",
                        path=str(agent_path),
                        line=1,
                        message=f"未在 agent 说明中声明 v2 输出 `{output}`",
                    )
                )

    return issues


def validate_repo(root: Path = PROJECT_ROOT, targets: str = "active") -> dict[str, list[ValidationIssue]]:
    contract = load_contract(root / ".claude" / "workflows" / "collab_v2.json")
    legacy_tokens = list(contract.get("legacy_aliases", {}).keys())

    errors: list[ValidationIssue] = []
    warnings: list[ValidationIssue] = []

    if targets in {"active", "all"}:
        for path in active_agent_files(root):
            errors.extend(
                scan_file_for_tokens(
                    path,
                    legacy_tokens,
                    severity="error",
                    prefix="活跃 agent/spec 禁止继续引用 legacy 产物",
                )
            )
        errors.extend(validate_stage_outputs(root, contract))

    if targets in {"docs", "all"}:
        for path in doc_files(root):
            errors.extend(
                scan_file_for_tokens(
                    path,
                    legacy_tokens,
                    severity="error",
                    prefix="活跃文档禁止继续引用 legacy 产物",
                )
            )

    if targets == "all":
        for path in article_files(root):
            warnings.extend(
                scan_file_for_tokens(
                    path,
                    legacy_tokens,
                    severity="warning",
                    prefix="历史样本仍在使用 legacy 产物名（允许保留）",
                )
            )

    return {"errors": errors, "warnings": warnings}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="校验工作流契约是否漂移。")
    parser.add_argument(
        "--targets",
        choices=("active", "docs", "all"),
        default="active",
        help="active=活跃 agent/spec；docs=活跃文档；all=两者加历史样本兼容提示",
    )
    return parser


def print_issues(title: str, issues: list[ValidationIssue]) -> None:
    if not issues:
        return
    print(title)
    for issue in issues:
        print(f"- [{issue.severity.upper()}] {issue.path}:{issue.line} {issue.message}")


def main() -> int:
    args = build_parser().parse_args()
    report = validate_repo(PROJECT_ROOT, args.targets)

    print_issues("校验失败：", report["errors"])
    print_issues("兼容提示：", report["warnings"])

    if report["errors"]:
        print(f"FAIL: 共 {len(report['errors'])} 个错误")
        return 1

    print("PASS: 工作流契约校验通过")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
