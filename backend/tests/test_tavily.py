import sys
from pathlib import Path

sys.path.append(
    str(Path(__file__).resolve().parent.parent)
)

from app.services.web_search import search_web

results = search_web(
    "latest EV adoption statistics 2025"
)

print(results)