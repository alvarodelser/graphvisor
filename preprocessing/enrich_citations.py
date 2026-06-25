#!/usr/bin/env python3
"""Enrich a GraphVisor corpus with per-paper citation counts.

For each document, the paper title (derived from the ``source`` field) is looked
up against Semantic Scholar; if no confident match is found, OpenAlex is tried as
a fallback. The first confident match writes ``citations: <n>`` onto the doc.
Papers with no confident match in either source are left untouched and reported.
"""

from __future__ import annotations

import argparse
import json
import shutil
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

from config import (
    CITATION_MATCH_THRESHOLD,
    corpus_path,
)
from openalex_client import OpenAlexError, search_paper as openalex_search
from semanticscholar_client import S2Error, search_paper as s2_search


def clean_title(source: str) -> str:
    """Strip a trailing ``" - <Journal>"`` suffix from a corpus ``source`` string.

    Splits on the *last* ``" - "`` separator so titles containing internal
    hyphens or dashes are preserved. Returns the trimmed input when no separator
    is present.
    """
    text = (source or "").strip()
    if " - " in text:
        head, _, _tail = text.rpartition(" - ")
        return head.strip()
    return text


def _normalize(text: str) -> str:
    return " ".join((text or "").lower().split())


def best_match(
    query_title: str,
    candidates: list[dict[str, Any]],
    title_key: str,
) -> dict[str, Any] | None:
    """Return the candidate whose title is most similar to ``query_title``.

    Similarity is computed with ``difflib.SequenceMatcher`` over lowercased,
    whitespace-normalized titles. Returns the highest-scoring candidate whose
    ratio is at least ``CITATION_MATCH_THRESHOLD``, else ``None``.
    """
    query_norm = _normalize(query_title)
    best: dict[str, Any] | None = None
    best_score = 0.0
    for candidate in candidates:
        candidate_title = candidate.get(title_key)
        if not candidate_title:
            continue
        score = SequenceMatcher(None, query_norm, _normalize(candidate_title)).ratio()
        if score >= CITATION_MATCH_THRESHOLD and score > best_score:
            best = candidate
            best_score = score
    return best


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Enrich a GraphVisor corpus with per-paper citation counts.",
    )
    parser.add_argument(
        "--dataset",
        help="Dataset id (reads/writes src/data/corpus_<id>.json).",
    )
    parser.add_argument(
        "--input",
        type=Path,
        help="Explicit corpus JSON path (overrides --dataset).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Output path. Defaults to overwriting --input in place.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-fetch papers that already have a citations value.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Perform lookups and report, but do not write the corpus file.",
    )
    return parser.parse_args()


def resolve_paths(args: argparse.Namespace) -> tuple[Path, Path]:
    if args.input and args.dataset:
        raise SystemExit("Use either --dataset or --input, not both.")

    input_path = args.input or corpus_path(args.dataset or "112")
    if not input_path.exists():
        raise SystemExit(f"Corpus file not found: {input_path}")

    output_path = args.output or input_path
    return input_path, output_path


def load_corpus(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, list):
        raise SystemExit(f"Expected a JSON array in {path}")
    return data


def write_corpus(
    path: Path, docs: list[dict[str, Any]], *, backup_source: Path | None
) -> None:
    if backup_source and backup_source.exists() and backup_source.samefile(path):
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup_path = path.with_suffix(path.suffix + f".bak.{stamp}")
        shutil.copy2(path, backup_path)
        print(f"Backup written to {backup_path}")

    tmp_path = path.with_suffix(path.suffix + ".tmp")
    with tmp_path.open("w", encoding="utf-8") as handle:
        json.dump(docs, handle, ensure_ascii=False, indent=4)
        handle.write("\n")
    tmp_path.replace(path)


def lookup_citations(title: str) -> tuple[int | None, str | None]:
    """Return ``(citation_count, source)`` for a title, or ``(None, None)``.

    Tries OpenAlex first (its free API is reliable), then Semantic Scholar as a
    fallback (its unauthenticated tier throttles heavily). ``source`` is
    ``"openalex"`` or ``"s2"`` for a confident match, else ``None``.
    """
    try:
        oa_candidates = openalex_search(title)
        match = best_match(title, oa_candidates, "display_name")
        if match and match.get("cited_by_count") is not None:
            return int(match["cited_by_count"]), "openalex"
    except OpenAlexError as exc:
        print(f"  OpenAlex lookup failed: {exc}")

    try:
        s2_candidates = s2_search(title)
        match = best_match(title, s2_candidates, "title")
        if match and match.get("citationCount") is not None:
            return int(match["citationCount"]), "s2"
    except S2Error as exc:
        print(f"  Semantic Scholar lookup failed: {exc}")

    return None, None


def main() -> int:
    args = parse_args()
    input_path, output_path = resolve_paths(args)
    docs = load_corpus(input_path)

    matched_s2 = 0
    matched_openalex = 0
    skipped = 0
    unmatched: list[str] = []

    for index, doc in enumerate(docs):
        if "citations" in doc and not args.force:
            skipped += 1
            continue

        title = clean_title(doc.get("source", ""))
        if not title:
            unmatched.append(f"(doc {index}: empty source)")
            continue

        count, source = lookup_citations(title)
        if source == "s2":
            doc["citations"] = count
            matched_s2 += 1
            print(f"[{index + 1}/{len(docs)}] s2={count}: {title}")
        elif source == "openalex":
            doc["citations"] = count
            matched_openalex += 1
            print(f"[{index + 1}/{len(docs)}] openalex={count}: {title}")
        else:
            unmatched.append(title)
            print(f"[{index + 1}/{len(docs)}] no match: {title}")

    print(
        f"\nSummary: {matched_s2} via Semantic Scholar, "
        f"{matched_openalex} via OpenAlex, {skipped} skipped, "
        f"{len(unmatched)} unmatched."
    )
    if unmatched:
        print("\nUnmatched titles (review manually):")
        for title in unmatched:
            print(f"  - {title}")

    if args.dry_run:
        print("\nDry run: corpus file not written.")
        return 0

    in_place = input_path.resolve() == output_path.resolve()
    write_corpus(output_path, docs, backup_source=input_path if in_place else None)
    print(f"\nWrote enriched corpus to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
