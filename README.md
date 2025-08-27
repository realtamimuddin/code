# ghreview

A modular Python CLI tool that analyzes any public GitHub repository for code quality, identifies potential bugs, and generates a markdown report with recommendations.

## Features

- Clone a public GitHub repository
- Analyze:
  - Cyclomatic complexity (per file)
  - Unused imports and dead code
  - Basic security issues (regex + AST + Bandit)
- Severity levels and consolidated findings
- Generates `CODE_REVIEW.md` in the repository root
- Optional `--auto-fix` to remove unused imports and format with `black`

## Installation

Create a virtual environment and install dependencies:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

Install the tool in editable mode (optional):

```bash
python -m pip install -e .
```

## Usage

```bash
python -m ghreview <GITHUB_URL> [--branch <name>] [--dest <dir>] [--auto-fix] [--log-level INFO]
```

Example:

```bash
python -m ghreview https://github.com/psf/requests --auto-fix
```

## Notes

- If `bandit` is not installed, security checks will still run using regex/AST, but Bandit findings will be skipped.
- `--auto-fix` uses `autoflake` and `black`.

## Extending

- Add new rules to `analysis.py` and extend the `Finding` model in `types.py` as needed.
- The project is modular: `repo.py` (git), `analysis.py` (checks), `report.py` (markdown), `cli.py` (argparse), `logging_config.py`.

## License

MIT
