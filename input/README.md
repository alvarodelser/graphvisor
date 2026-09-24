# input/

Drop documents here, one folder per collection:

```
input/
  <collection>/
    paper-a.pdf
    paper-b.pdf
```

- **Collection name** is the folder name: lowercase letters, digits, `-` and `_` (e.g. `medils`, `corpus_2026`). Each collection becomes its own partition in Neo4j.
- **Files**, per document, named `<id>.<ext>`:
  - `<id>.json` following [`document.schema.json`](document.schema.json) (required: `title`, `year`, `body`), and/or
  - `<id>.pdf`.
  Other files (CSV lists, fetch scripts) are ignored. The `<id>` is the document id within the collection, so keep names stable and unique.

### Which steps run

| Input has | Pipeline does |
|---|---|
| `<id>.json` | Skips OCR: rebuilds the text from `body` and sends it to the wiig chunker. The JSON wins over a PDF with the same id. |
| only `<id>.pdf` | OCR → wiig chunker (the old pipeline) |
| empty `abstract` | Generates one (as the old pipeline did when no abstract chunk was found) |
| no `title`/`year` (PDF only) | Looks them up in OpenAlex, with Ollama as fallback |
| `citations` | Skips the citation lookup |
| `doi`, no `citations` | Looks up citations in OpenAlex by exact DOI |

Source-specific cleanup belongs in the script that produces the JSONs (e.g. `sci_corpus/fetch_corpus.py`), not in the pipeline. Hidden folders (like `.backups/`) are ignored.

Processing is started manually from the `graphvisor_start` workflow in n8n with the collection name. See `docs/superpowers/specs/2026-09-23-auto-ingestion-design.md`.
