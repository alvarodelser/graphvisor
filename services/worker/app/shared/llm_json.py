"""Parse the JSON an LLM returned. Unparsable output is a 422, which makes the
n8n Ollama node retry (the old pipeline retried L2 up to 3 times)."""

import json
import re

from fastapi import HTTPException

_THINK = re.compile(r"<think>.*?</think>", re.DOTALL)
_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$")


class LLMJSONError(ValueError):
    pass


def loads(raw: str):
    """Parse or raise LLMJSONError."""
    text = _THINK.sub("", raw or "").strip()
    text = _FENCE.sub("", text).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise LLMJSONError(f"{exc}: {text[:300]!r}") from exc


def parse(raw: str):
    """Parse or raise HTTP 422."""
    try:
        return loads(raw)
    except LLMJSONError as exc:
        raise HTTPException(status_code=422, detail=f"invalid LLM JSON: {exc}") from exc
