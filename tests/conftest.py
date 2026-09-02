import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = Path(__file__).resolve().parent / "fixtures"

# Make scripts/ importable as top-level modules.
sys.path.insert(0, str(ROOT / "scripts"))


@pytest.fixture(scope="session")
def calendar_week():
    return json.loads((FIXTURES / "calendar_week.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def sample_xlsx_path():
    return FIXTURES / "sample_week.xlsx"
