import logging
import re
import tempfile
from pathlib import Path
from typing import Iterable

from git import Repo  # type: ignore[import-untyped]


class RepoManager:
    """Handle cloning and basic repository file enumeration."""

    _GITHUB_URL_RE = re.compile(
        r"^(https://github.com/[^/]+/[^/]+(?:\.git)?|git@github.com:[^/]+/[^/]+(?:\.git)?)$"
    )

    def __init__(self) -> None:
        self._logger = logging.getLogger(self.__class__.__name__)

    def clone_repo(self, url: str, dest_dir: str | None = None, branch: str | None = None) -> Path:
        if not self._GITHUB_URL_RE.match(url):
            raise ValueError(
                "URL must be a public GitHub repository (https or git@github.com)."
            )

        if dest_dir is None:
            tmpdir = tempfile.mkdtemp(prefix="ghreview_")
            dest_path = Path(tmpdir)
        else:
            dest_path = Path(dest_dir)
            dest_path.mkdir(parents=True, exist_ok=True)

        self._logger.info("Cloning %s to %s", url, dest_path)
        repo = Repo.clone_from(url, dest_path)
        if branch:
            self._logger.info("Checking out %s", branch)
            repo.git.checkout(branch)
        return dest_path

    @staticmethod
    def iter_python_files(root: Path) -> Iterable[Path]:
        for path in root.rglob("*.py"):
            # Skip common virtual env and cache dirs
            parts = {p.name for p in path.parents}
            if any(
                skip in parts
                for skip in {".venv", "venv", "env", "site-packages", "__pycache__"}
            ):
                continue
            yield path

