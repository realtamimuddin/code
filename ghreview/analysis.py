from __future__ import annotations

import json
import logging
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List

from radon.complexity import cc_visit  # type: ignore[import-untyped]
from vulture.core import Vulture  # type: ignore[import-untyped]

from .repo import RepoManager
from .types import Finding, FileComplexity, Severity


_LOGGER = logging.getLogger(__name__)


def _read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except Exception:  # noqa: BLE001 - tolerant reader
        return ""


def analyze_complexity(repo_root: Path) -> List[FileComplexity]:
    results: List[FileComplexity] = []
    for file_path in RepoManager.iter_python_files(repo_root):
        source = _read_text(file_path)
        if not source:
            continue
        blocks = cc_visit(source)
        if not blocks:
            continue
        complexities = [b.complexity for b in blocks]
        avg = sum(complexities) / len(complexities)
        max_c = max(complexities)
        results.append(
            FileComplexity(
                file_path=str(file_path.relative_to(repo_root)),
                average_complexity=round(avg, 2),
                max_complexity=round(max_c, 2),
            )
        )
    return results


def _severity_for_complexity(value: float) -> Severity:
    if value > 20:
        return Severity.HIGH
    if value > 10:
        return Severity.MEDIUM
    return Severity.LOW


def analyze_unused_code(repo_root: Path) -> List[Finding]:
    vulture = Vulture()
    vulture.scavenge([str(repo_root)])
    findings: List[Finding] = []
    for item in vulture.get_unused_code():
        # item has attributes: name, typ, filename, lineno, size, message
        severity = Severity.LOW if item.typ == "import" else Severity.MEDIUM
        findings.append(
            Finding(
                file_path=str(Path(item.filename).resolve().relative_to(repo_root)),
                line=item.lineno or 1,
                rule_id=f"VULTURE_{item.typ.upper()}",
                message=item.message or f"Unused {item.typ}: {item.name}",
                severity=severity,
                source="vulture",
            )
        )
    return findings


def _run_bandit(repo_root: Path) -> List[Finding]:
    cmd = [
        "bandit",
        "-r",
        str(repo_root),
        "-f",
        "json",
        "-q",
    ]
    try:
        proc = subprocess.run(
            cmd,
            check=False,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError:
        _LOGGER.warning("bandit not found; skipping bandit security checks")
        return []

    output = proc.stdout.strip()
    if not output:
        return []
    try:
        data = json.loads(output)
    except json.JSONDecodeError:
        _LOGGER.warning("Failed to parse bandit output")
        return []

    results = []
    for issue in data.get("results", []) or []:
        sev = issue.get("issue_severity", "LOW").upper()
        severity = Severity[sev] if sev in Severity.__members__ else Severity.LOW
        filename = issue.get("filename", "")
        try:
            rel_file = str(Path(filename).resolve().relative_to(repo_root))
        except Exception:  # noqa: BLE001 - tolerant
            rel_file = filename
        results.append(
            Finding(
                file_path=rel_file,
                line=int(issue.get("line_number", 1)),
                rule_id=str(issue.get("test_id", "BANDIT")),
                message=str(issue.get("issue_text", "Security issue")),
                severity=severity,
                source="bandit",
            )
        )
    return results


_CRED_PATTERNS = [
    re.compile(r"aws_access_key_id\s*=\s*[\"']?AKIA[0-9A-Z]{16}[\"']?", re.IGNORECASE),
    re.compile(r"aws_secret_access_key\s*=\s*[\"']?[A-Za-z0-9/+=]{40}[\"']?", re.IGNORECASE),
    re.compile(r"(password|passwd|pwd|secret|token|api_key)\s*=\s*[\"'].+[\"']", re.IGNORECASE),
    re.compile(r"BEGIN RSA PRIVATE KEY"),
]


def _regex_security_scan(repo_root: Path) -> List[Finding]:
    findings: List[Finding] = []
    for file_path in RepoManager.iter_python_files(repo_root):
        text = _read_text(file_path)
        if not text:
            continue
        for pattern in _CRED_PATTERNS:
            for match in pattern.finditer(text):
                line = text.count("\n", 0, match.start()) + 1
                findings.append(
                    Finding(
                        file_path=str(file_path.relative_to(repo_root)),
                        line=line,
                        rule_id="HARDCODED_CREDENTIAL",
                        message="Possible hardcoded credential",
                        severity=Severity.HIGH,
                        source="regex",
                    )
                )
    return findings


def _ast_security_scan(repo_root: Path) -> List[Finding]:
    import ast

    findings: List[Finding] = []

    insecure_calls = {
        ("eval", None): ("Use of eval() is insecure", Severity.HIGH),
        ("exec", None): ("Use of exec() is insecure", Severity.HIGH),
        ("load", "pickle"): ("pickle.load is insecure with untrusted data", Severity.HIGH),
        ("loads", "pickle"): ("pickle.loads is insecure with untrusted data", Severity.HIGH),
        ("system", "os"): ("os.system may be unsafe", Severity.MEDIUM),
        ("popen", "os"): ("os.popen may be unsafe", Severity.MEDIUM),
        ("Popen", "subprocess"): ("subprocess.Popen may be unsafe", Severity.MEDIUM),
        ("call", "subprocess"): ("subprocess.call may be unsafe", Severity.MEDIUM),
        ("run", "subprocess"): ("subprocess.run may be unsafe with shell=True", Severity.MEDIUM),
        ("load", "yaml"): ("yaml.load without SafeLoader is unsafe", Severity.HIGH),
    }

    for file_path in RepoManager.iter_python_files(repo_root):
        try:
            node = ast.parse(_read_text(file_path) or "", filename=str(file_path))
        except SyntaxError:
            continue

        class Visitor(ast.NodeVisitor):
            def visit_Call(self, call: ast.Call) -> None:  # noqa: N802 - AST API
                func = call.func
                mod_name = None
                func_name = None
                if isinstance(func, ast.Name):
                    func_name = func.id
                elif isinstance(func, ast.Attribute):
                    func_name = func.attr
                    if isinstance(func.value, ast.Name):
                        mod_name = func.value.id

                key = (func_name, mod_name)
                if key in insecure_calls:
                    message, severity = insecure_calls[key]
                    findings.append(
                        Finding(
                            file_path=str(file_path.relative_to(repo_root)),
                            line=getattr(call, "lineno", 1),
                            rule_id=f"AST_{func_name}",
                            message=message,
                            severity=severity,
                            source="ast",
                        )
                    )

                # special case: subprocess.* with shell=True
                if (
                    (func_name in {"Popen", "run", "call"} and mod_name == "subprocess")
                    or (mod_name is None and func_name in {"popen"})
                ):
                    for kw in call.keywords or []:
                        if kw.arg == "shell":
                            try:
                                if isinstance(kw.value, ast.Constant) and bool(kw.value.value):
                                    findings.append(
                                        Finding(
                                            file_path=str(file_path.relative_to(repo_root)),
                                            line=getattr(call, "lineno", 1),
                                            rule_id="SUBPROCESS_SHELL_TRUE",
                                            message="subprocess with shell=True is dangerous",
                                            severity=Severity.HIGH,
                                            source="ast",
                                        )
                                    )
                            except Exception:
                                pass

                # yaml.load without loader
                if func_name == "load" and mod_name == "yaml":
                    if not call.keywords or all(
                        kw.arg != "Loader" and kw.arg != "Loader=" for kw in call.keywords
                    ):
                        findings.append(
                            Finding(
                                file_path=str(file_path.relative_to(repo_root)),
                                line=getattr(call, "lineno", 1),
                                rule_id="YAML_UNSAFE_LOAD",
                                message="yaml.load without SafeLoader is unsafe",
                                severity=Severity.HIGH,
                                source="ast",
                            )
                        )

                self.generic_visit(call)

        Visitor().visit(node)

    return findings


def analyze_security(repo_root: Path) -> List[Finding]:
    findings: List[Finding] = []
    findings.extend(_run_bandit(repo_root))
    findings.extend(_regex_security_scan(repo_root))
    findings.extend(_ast_security_scan(repo_root))
    return findings


def run_autofix(repo_root: Path) -> None:
    cmds = [
        [
            "autoflake",
            "--in-place",
            "--remove-all-unused-imports",
            "--recursive",
            str(repo_root),
        ],
        ["black", str(repo_root)],
    ]
    for cmd in cmds:
        _LOGGER.info("Running: %s", " ".join(cmd))
        subprocess.run(cmd, check=True)


def run_all_analyses(repo_root: Path) -> dict:
    complexities = analyze_complexity(repo_root)

    findings: List[Finding] = []
    # Turn high complexity into findings
    for metric in complexities:
        sev = _severity_for_complexity(metric.max_complexity)
        if sev is not Severity.LOW:
            findings.append(
                Finding(
                    file_path=metric.file_path,
                    line=1,
                    rule_id="COMPLEXITY_HIGH" if sev is Severity.HIGH else "COMPLEXITY_MEDIUM",
                    message=(
                        f"High cyclomatic complexity (max {metric.max_complexity}, avg {metric.average_complexity})"
                    ),
                    severity=sev,
                    source="radon",
                )
            )

    findings.extend(analyze_unused_code(repo_root))
    findings.extend(analyze_security(repo_root))

    return {"complexities": complexities, "findings": findings}

