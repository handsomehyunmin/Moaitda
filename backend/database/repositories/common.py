
import json
from datetime import datetime, timezone


def now():
    return datetime.now(timezone.utc).isoformat()


def _json_list(value):
    if not value:
        return []

    try:
        parsed = json.loads(value)

        if isinstance(parsed, list):
            return parsed

        return []

    except (TypeError, ValueError):
        return []
