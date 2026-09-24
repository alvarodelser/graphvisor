"""Unit tests for the pure helpers in enrich_citations (no network)."""

from enrich_citations import best_match, clean_title


class TestCleanTitle:
    def test_strips_trailing_journal_suffix(self):
        source = "Avoidance of inter-repeat recombination - Biochimie"
        assert clean_title(source) == "Avoidance of inter-repeat recombination"

    def test_preserves_internal_hyphens(self):
        source = "Sequence divergence and a mechanism of neutral evolution - Nature"
        assert clean_title(source) == (
            "Sequence divergence and a mechanism of neutral evolution"
        )

    def test_splits_on_last_separator(self):
        source = "Title - with - dashes - Journal Name"
        assert clean_title(source) == "Title - with - dashes"

    def test_returns_trimmed_input_when_no_separator(self):
        source = "  A title without any separator  "
        assert clean_title(source) == "A title without any separator"


class TestBestMatch:
    def test_accepts_near_identical_candidate(self):
        query = "Avoidance of inter-repeat recombination"
        candidates = [{"title": "Avoidance of inter-repeat recombination"}]
        result = best_match(query, candidates, "title")
        assert result is candidates[0]

    def test_rejects_dissimilar_candidate(self):
        query = "Avoidance of inter-repeat recombination"
        candidates = [{"title": "An entirely unrelated paper about quantum gravity"}]
        assert best_match(query, candidates, "title") is None

    def test_returns_none_for_empty_candidates(self):
        assert best_match("anything", [], "title") is None

    def test_selects_highest_scoring_above_threshold(self):
        query = "Sequence divergence and neutral evolution"
        candidates = [
            {"title": "Sequence divergence and something else entirely here"},
            {"title": "Sequence divergence and neutral evolution"},
        ]
        result = best_match(query, candidates, "title")
        assert result is candidates[1]

    def test_handles_candidate_missing_title_key(self):
        query = "Some paper title here"
        candidates = [{"title": None}, {"title": "Some paper title here"}]
        result = best_match(query, candidates, "title")
        assert result is candidates[1]
