import argparse
import logging
import sys
from pathlib import Path

from .logging_config import configure_logging
from .repo import RepoManager
from .analysis import (
    run_all_analyses,
    run_autofix,
)
from .report import generate_markdown_report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ghreview",
        description=(
            "Analyze a public GitHub repository for code quality, potential bugs, "
            "and basic security issues, then generate a CODE_REVIEW.md report."
        ),
    )
    parser.add_argument("url", help="GitHub repository URL (public)")
    parser.add_argument(
        "--dest",
        type=str,
        default=None,
        help="Destination directory to clone into (default: temporary directory)",
    )
    parser.add_argument(
        "--branch",
        type=str,
        default=None,
        help="Optional branch or tag to checkout after cloning",
    )
    parser.add_argument(
        "--auto-fix",
        action="store_true",
        help=(
            "Automatically remove unused imports with autoflake and format using black "
            "before analysis"
        ),
    )
    parser.add_argument(
        "--log-level",
        type=str,
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"],
        help="Logging level (default: INFO)",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    if argv is None:
        argv = sys.argv[1:]

    parser = build_parser()
    args = parser.parse_args(argv)

    configure_logging(args.log_level)
    logger = logging.getLogger(__name__)

    repo_manager = RepoManager()
    try:
        repo_path = repo_manager.clone_repo(args.url, dest_dir=args.dest, branch=args.branch)
    except Exception as exc:  # noqa: BLE001 - user-facing CLI
        logger.error("Failed to clone repository: %s", exc)
        return 2

    if args.auto_fix:
        try:
            run_autofix(repo_path)
        except Exception as exc:  # noqa: BLE001 - user-facing CLI
            logger.error("Auto-fix failed: %s", exc)
            # Continue with analysis even if auto-fix fails

    try:
        analyses = run_all_analyses(repo_path)
    except Exception as exc:  # noqa: BLE001 - user-facing CLI
        logger.error("Analysis failed: %s", exc)
        return 3

    try:
        report_path = generate_markdown_report(
            repo_root=repo_path,
            complexities=analyses["complexities"],
            findings=analyses["findings"],
        )
    except Exception as exc:  # noqa: BLE001 - user-facing CLI
        logger.error("Failed to generate report: %s", exc)
        return 4

    logger.info("Report written to %s", report_path)
    return 0

