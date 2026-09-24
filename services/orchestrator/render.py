"""Render workflows/graphvisor_*.json into a staging dir for n8n import.

Markers inside any string value of a workflow:
  {{PROMPT:<name>.user}}    prompts/<name>.user.txt, converted from the old
                            Python str.format syntax to n8n expressions:
                            {x} -> {{ $json.x }}, {{ -> {, }} -> }.
                            The string must be an n8n expression (start with "=").
  {{PROMPT:<name>.system}}  prompts/<name>.system.txt verbatim (the old code
                            never .format()ed system prompts). The string must
                            NOT be an expression, or n8n would evaluate any {{ }}.
  {{ENV:<KEY>}}             the value of KEY in the environment (services/.env).

Refuses files whose top-level name isn't graphvisor_* or that lack an id, and
fails on any marker it can't resolve.

Usage: python3 render.py <out_dir>
"""

import json
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
MARKER = re.compile(r"\{\{(PROMPT|ENV):([A-Za-z0-9_.]+)\}\}")
FORMAT_TOKEN = re.compile(r"\{\{|\}\}|\{(\w+)\}")


def user_prompt_to_n8n(text: str) -> str:
    def sub(m):
        if m.group(0) == "{{":
            return "{"
        if m.group(0) == "}}":
            return "}"
        return "{{ $json." + m.group(1) + " }}"
    return FORMAT_TOKEN.sub(sub, text)


def resolve(kind: str, key: str, is_expression: bool, where: str) -> str:
    if kind == "ENV":
        if not os.environ.get(key):
            raise SystemExit(f"{where}: {key} is not set in services/.env")
        return os.environ[key]
    path = HERE / "prompts" / f"{key}.txt"
    if not path.is_file():
        raise SystemExit(f"{where}: no prompt file {path.name}")
    text = path.read_text(encoding="utf-8")
    if key.endswith(".user"):
        if not is_expression:
            raise SystemExit(f"{where}: {key} needs an expression field (value starting with '=')")
        return user_prompt_to_n8n(text)
    if key.endswith(".system"):
        if is_expression:
            raise SystemExit(f"{where}: {key} must be in a fixed (non-expression) field")
        return text
    raise SystemExit(f"{where}: prompt marker must end in .user or .system: {key}")


def render(value, where: str):
    if isinstance(value, dict):
        return {k: render(v, f"{where}.{k}") for k, v in value.items()}
    if isinstance(value, list):
        return [render(v, f"{where}[{i}]") for i, v in enumerate(value)]
    if isinstance(value, str) and "{{" in value:
        is_expression = value.startswith("=")
        return MARKER.sub(lambda m: resolve(m.group(1), m.group(2), is_expression, where), value)
    return value


def main(out_dir: str) -> None:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    files = sorted((HERE / "workflows").glob("graphvisor_*.json"))
    if not files:
        raise SystemExit("no workflows/graphvisor_*.json to render")
    for f in files:
        wf = json.loads(f.read_text(encoding="utf-8"))
        if not str(wf.get("name", "")).startswith("graphvisor_"):
            raise SystemExit(f"{f.name}: workflow name {wf.get('name')!r} is not graphvisor_*")
        if not wf.get("id"):
            raise SystemExit(f"{f.name}: no id")
        rendered = render(wf, f.name)
        leftover = MARKER.search(json.dumps(rendered))
        if leftover:
            raise SystemExit(f"{f.name}: unresolved marker {leftover.group(0)}")
        (out / f.name).write_text(json.dumps(rendered, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"{wf['id']}\t{wf['name']}")


if __name__ == "__main__":
    main(sys.argv[1])
