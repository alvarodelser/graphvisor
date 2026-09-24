"""Build the sci_corpus collection from "csv-list of articles.csv".

For every PMCID in the CSV this writes, next to this script:
  PMCxxxxxxx.pdf   open-access PDF (absent when the license is TDM-only)
  PMCxxxxxxx.json  normalized GraphVisor input document
                   (see ../document.schema.json): id, title, year, doi,
                   abstract, body [{headings, text}]

Sources:
  - PMC Article Datasets on AWS (s3://pmc-oa-opendata, public, no auth):
    PDF, and JATS XML as a text fallback.
  - BioC-PMC API: title, abstract, body text.
    Articles not (yet) in BioC fall back to parsing the JATS XML.

Only argument-bearing body text is kept: abbreviation lists, author
contributions, competing interests, review info, acknowledgements/funding,
supplementary material and footnotes are dropped (NON_CONTENT_SECTIONS).

Not extracted (available from these sources if needed later):
  - from the CSV: pmid, authors string, first author, journal, citation
    string, create date, NIHMS id
  - from the S3 metadata JSON: license_code, is_retracted, is_manuscript
  - from JATS XML: structured authors (surname, given names, ORCID, collab),
    journal title, keywords (kwd-group)
  - from BioC: front-matter infons (volume, issue, license, article ids),
    per-paragraph section_type, figures (id, file, caption), tables
    (caption, text, footnote, xml), structured references (title, authors,
    source, year, volume, pages, doi, pmid, pmcid)
  The last full-metadata version of this script and its output are archived
  in ../.backups/sci_corpus_json_raw_*.tar.gz.

Published errata (PubMed publication type "Published Erratum") are skipped:
a correction notice has no arguments to extract. Their files are deleted if
an earlier run downloaded them.

Malformed articles (no title or no body text after filtering) are deleted
(PDF + JSON) and reported.

Idempotent: only missing articles are downloaded; every existing JSON is
(re)normalized on each run.
Usage: python3 fetch_corpus.py
"""
import concurrent.futures as cf
import csv
import json
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

OUT = Path(__file__).resolve().parent
CSV = OUT / "csv-list of articles.csv"
BUCKET = "https://pmc-oa-opendata.s3.amazonaws.com"
BIOC = "https://www.ncbi.nlm.nih.gov/research/bionlp/RESTful/pmcoa.cgi/BioC_json/{}/unicode"
ESUMMARY = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id={}"
SKIPPED_PUBLICATION_TYPES = {"Published Erratum"}

NON_CONTENT_SECTIONS = {"ABBR", "AUTH_CONT", "COMP_INT", "REVIEW_INFO", "ACK_FUND", "SUPPL"}


def get(url, retries=3):
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return r.read()
        except Exception:
            if attempt == retries - 1:
                raise


def s3(uri):
    return get(BUCKET + urllib.parse.urlparse(uri).path)


def latest_meta(pmcid):
    xml = get(f"{BUCKET}/?list-type=2&delimiter=/&prefix={pmcid}.").decode()
    vers = [int(v) for v in re.findall(rf"<Prefix>{pmcid}\.(\d+)/</Prefix>", xml)]
    if not vers:
        return None
    v = max(vers)
    return json.loads(get(f"{BUCKET}/{pmcid}.{v}/{pmcid}.{v}.json"))


def text_of(el):
    return " ".join("".join(el.itertext()).split()) if el is not None else None


# ---------- BioC: title, abstract, body ----------

def parse_bioc(raw):
    doc = json.loads(raw)[0]["documents"][0]
    out = {"title": None, "doi": None, "year": None, "abstract": [], "body": []}
    heading_path = []
    for p in doc["passages"]:
        inf, text = p["infons"], p.get("text", "").strip()
        sec, typ = inf.get("section_type"), inf.get("type")
        if typ == "front":
            out["title"], out["doi"], out["year"] = text, inf.get("article-id_doi"), inf.get("year")
        elif sec == "ABSTRACT":
            if typ.startswith("title"):
                continue
            out["abstract"].append(text)
        elif sec in ("REF", "FIG", "TABLE"):
            continue
        elif typ and typ.startswith("title"):
            level = int(typ[6:]) if typ[6:].isdigit() else 1
            heading_path = heading_path[: level - 1] + [text]
        elif text:
            out["body"].append({"section_type": sec, "headings": list(heading_path),
                                "type": typ, "text": text})
    return out


# ---------- JATS fallback for articles not (yet) in BioC ----------

SECTION_TYPES = [("abbreviation", "ABBR"), ("intro", "INTRO"), ("background", "INTRO"),
                 ("method", "METHODS"), ("material", "METHODS"), ("result", "RESULTS"),
                 ("discussion", "DISCUSS"), ("conclusion", "CONCL"),
                 ("author contribution", "AUTH_CONT"), ("competing interest", "COMP_INT"),
                 ("conflict", "COMP_INT"), ("acknowledg", "ACK_FUND"), ("funding", "ACK_FUND"),
                 ("supplementary", "SUPPL")]


def section_type(title, current):
    t = (title or "").lower()
    return next((st for key, st in SECTION_TYPES if key in t), current)


def parse_jats_content(raw):
    root = ET.fromstring(raw)
    meta = root.find(".//article-meta")
    out = {"title": text_of(meta.find(".//article-title")),
           "doi": text_of(meta.find("article-id[@pub-id-type='doi']")),
           "year": text_of(meta.find(".//pub-date/year")),
           "abstract": [text_of(p) for p in meta.findall("abstract//p")], "body": []}

    def walk(sec, path, st):
        title = text_of(sec.find("title"))
        path = path + [title] if title else path
        st = section_type(title, st)
        for child in sec:
            if child.tag == "p":
                out["body"].append({"section_type": st, "headings": path, "type": "paragraph",
                                    "text": text_of(child)})
            elif child.tag == "sec":
                walk(child, path, st)

    for group in (root.find("body"), root.find("back")):
        if group is not None:
            for sec in group.findall("sec"):
                walk(sec, [], "INTRO")
    return out


# ---------- normalized form ----------

def normalize(pmcid, article):
    """Reduce an article to the GraphVisor input schema. Idempotent: an
    already-normalized document comes back unchanged."""
    body = [
        {"headings": p.get("headings") or [], "text": p["text"]}
        for p in article.get("body", [])
        if p.get("text")
        and p.get("section_type") not in NON_CONTENT_SECTIONS
        and p.get("type", "paragraph") == "paragraph"
    ]
    abstract = article.get("abstract") or ""
    if isinstance(abstract, list):
        abstract = "\n\n".join(abstract)
    year = str(article.get("year") or "")
    return {
        "id": pmcid,
        "title": article.get("title"),
        "year": int(year) if year.isdigit() else None,
        "doi": article.get("doi") or None,
        "abstract": abstract,
        "body": body,
    }


# ---------- per article ----------

def fetch(row):
    pmcid = row["PMCID"].strip()
    pdf_path, json_path = OUT / f"{pmcid}.pdf", OUT / f"{pmcid}.json"
    notes = []
    try:
        meta = latest_meta(pmcid)
        if meta is None:
            notes.append("not in PMC OA cloud")

        if meta and not pdf_path.exists():
            if meta.get("pdf_url"):
                data = s3(meta["pdf_url"])
                if data.startswith(b"%PDF"):
                    pdf_path.write_bytes(data)
                else:
                    notes.append("pdf download is not a PDF")
            else:
                notes.append(f"no pdf (license {meta.get('license_code')})")

        if not json_path.exists():
            bioc_raw = get(BIOC.format(pmcid))
            if not bioc_raw.lstrip().startswith(b"[Error]"):
                article = parse_bioc(bioc_raw)
            elif meta and meta.get("xml_url"):
                article = parse_jats_content(s3(meta["xml_url"]))
                notes.append("not in BioC, text parsed from JATS XML")
            else:
                raise RuntimeError("no text source available")
            article["title"] = article["title"] or row["Title"]
            article["doi"] = row["DOI"].strip() or article["doi"]
            article["year"] = row["Publication Year"] or article["year"]
            write(json_path, normalize(pmcid, article))
    except Exception as e:
        notes.append(f"error {type(e).__name__}: {e}")
    return pmcid, notes


def write(json_path, doc):
    json_path.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")


def normalize_existing(rows):
    n = 0
    for r in rows:
        pmcid = r["PMCID"].strip()
        json_path = OUT / f"{pmcid}.json"
        if json_path.exists():
            write(json_path, normalize(pmcid, json.loads(json_path.read_text(encoding="utf-8"))))
            n += 1
    print(f"normalized {n} existing JSON file(s)")


def skipped_by_type(rows):
    """{pmcid: publication type} for the rows PubMed classifies as a skipped
    publication type. One esummary request per 200 PMIDs."""
    by_pmid = {r["PMID"].strip(): r["PMCID"].strip() for r in rows if r["PMID"].strip()}
    pmids, skipped = list(by_pmid), {}
    for i in range(0, len(pmids), 200):
        result = json.loads(get(ESUMMARY.format(",".join(pmids[i:i + 200]))))["result"]
        for pmid in result.get("uids", []):
            types = set(result[pmid].get("pubtype", [])) & SKIPPED_PUBLICATION_TYPES
            if types:
                skipped[by_pmid[pmid]] = sorted(types)[0]
    return skipped


def malformed_reason(json_path):
    try:
        article = json.loads(json_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        return f"unreadable JSON ({type(e).__name__})"
    if not article.get("title"):
        return "no title"
    if not article.get("body"):
        return "no body text"
    return None


def remove_malformed(rows):
    removed = []
    for r in rows:
        pmcid = r["PMCID"].strip()
        json_path = OUT / f"{pmcid}.json"
        if not json_path.exists():
            continue
        reason = malformed_reason(json_path)
        if reason:
            json_path.unlink()
            (OUT / f"{pmcid}.pdf").unlink(missing_ok=True)
            removed.append((pmcid, reason, r["Title"]))
    return removed


def main():
    rows = list(csv.DictReader(open(CSV, encoding="utf-8-sig")))
    skipped = skipped_by_type(rows)
    for pmcid, kind in sorted(skipped.items()):
        (OUT / f"{pmcid}.json").unlink(missing_ok=True)
        (OUT / f"{pmcid}.pdf").unlink(missing_ok=True)
        print(f"{pmcid} skipped: {kind}")
    rows = [r for r in rows if r["PMCID"].strip() not in skipped]
    with cf.ThreadPoolExecutor(6) as ex:
        results = list(ex.map(fetch, rows))
    for pmcid, notes in results:
        if notes:
            print(pmcid, "; ".join(notes))
    normalize_existing(rows)
    removed = remove_malformed(rows)
    if removed:
        print(f"\nRemoved {len(removed)} malformed article(s) (PDF + JSON deleted):")
        for pmcid, reason, title in removed:
            print(f"  {pmcid}  {reason}  - {title[:90]}")
    n_pdf = sum((OUT / f"{r['PMCID'].strip()}.pdf").exists() for r in rows)
    n_json = sum((OUT / f"{r['PMCID'].strip()}.json").exists() for r in rows)
    print(f"\n{len(rows) + len(skipped)} articles in CSV, {len(skipped)} skipped by publication type: "
          f"{n_json} kept as JSON, {n_pdf} PDFs, {len(removed)} removed as malformed")


if __name__ == "__main__":
    main()
