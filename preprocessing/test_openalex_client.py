"""Unit tests for OpenAlex query sanitization (no network)."""

from openalex_client import sanitize_query


def test_replaces_commas_with_spaces():
    # Comma is OpenAlex's filter separator; an unescaped comma 400s the request.
    assert sanitize_query("1,N6-ethenoadenine and 3,N4-ethenocytosine") == (
        "1 N6-ethenoadenine and 3 N4-ethenocytosine"
    )


def test_replaces_pipes_with_spaces():
    # Pipe is OpenAlex's OR separator within a filter value.
    assert sanitize_query("repair|recombination") == "repair recombination"


def test_collapses_resulting_whitespace():
    assert sanitize_query("a,  b ,c") == "a b c"


def test_leaves_plain_title_unchanged():
    assert sanitize_query("Mismatch repair in Escherichia coli") == (
        "Mismatch repair in Escherichia coli"
    )
