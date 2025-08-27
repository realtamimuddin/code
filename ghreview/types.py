from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Severity(Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


@dataclass
class Finding:
    file_path: str
    line: int
    rule_id: str
    message: str
    severity: Severity
    source: str


@dataclass
class FileComplexity:
    file_path: str
    average_complexity: float
    max_complexity: float

