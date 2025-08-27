from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Iterable, List

from .types import FileComplexity, Finding, Severity


def _severity_emoji(sev: Severity) -> str:
    return {Severity.HIGH: "❗", Severity.MEDIUM: "⚠️", Severity.LOW: "ℹ️"}.get(sev, "")


def _severity_sort_key(sev: Severity) -> int:
    return {Severity.HIGH: 0, Severity.MEDIUM: 1, Severity.LOW: 2}.get(sev, 3)


def generate_markdown_report(
    repo_root: Path,
    complexities: List[FileComplexity],
    findings: List[Finding],
) -> Path:
    report_path = repo_root / "CODE_REVIEW.md"

    total_files = len({c.file_path for c in complexities})
    high = sum(1 for f in findings if f.severity is Severity.HIGH)
    medium = sum(1 for f in findings if f.severity is Severity.MEDIUM)
    low = sum(1 for f in findings if f.severity is Severity.LOW)

    lines: List[str] = []
    lines.append(f"# Code Review Report\n")
    lines.append(f"Generated: {datetime.utcnow().isoformat()}Z\n")
    lines.append("")
    lines.append("## Summary\n")
    lines.append(f"- Files analyzed: {total_files}")
    lines.append(f"- High severity: {high}")
    lines.append(f"- Medium severity: {medium}")
    lines.append(f"- Low severity: {low}\n")

    lines.append("## Cyclomatic Complexity (per file)\n")
    for metric in sorted(complexities, key=lambda m: (-m.max_complexity, m.file_path)):
        sev = _severity_emoji(Severity.HIGH if metric.max_complexity > 20 else (Severity.MEDIUM if metric.max_complexity > 10 else Severity.LOW))
        lines.append(
            f"- {metric.file_path}: avg {metric.average_complexity}, max {metric.max_complexity} {sev}"
        )
    lines.append("")

    lines.append("## Findings\n")
    findings_sorted = sorted(findings, key=lambda f: (_severity_sort_key(f.severity), f.file_path, f.line))
    for f in findings_sorted:
        lines.append(
            f"- [{f.severity.name}] {_severity_emoji(f.severity)} {f.file_path}:{f.line} - {f.rule_id} - {f.message} ({f.source})"
        )
    lines.append("")

    lines.append("## Recommendations\n")
    lines.append("- Reduce high-complexity functions by refactoring into smaller units.")
    lines.append("- Remove unused imports and dead code to improve maintainability.")
    lines.append("- Avoid insecure functions (eval/exec), unsafe subprocess usage, and unsafe YAML loading.")
    lines.append("- Rotate any suspected hardcoded credentials and move secrets to environment variables or secret managers.")
    lines.append("- Adopt automated formatters and linters (black, ruff, bandit) in CI.")
    lines.append("")

    report_path.write_text("\n".join(lines), encoding="utf-8")
    return report_path

