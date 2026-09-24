"""best_match (from preprocessing/test_enrich_citations.py; clean_title isn't needed:
input titles carry no " - Journal" suffix)."""

from app.enrichment.common import best_match


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
