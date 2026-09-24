"""render.py: prompt conversion and the guards. Run with the worker venv:
services/worker/.venv/bin/pytest services/orchestrator"""

import json

import pytest

import render


def test_user_prompt_placeholders_become_n8n_expressions():
    out = render.user_prompt_to_n8n('Text:\n{input_text}\n{{\n  "MajorClaim": [{{"text": "..."}}]\n}}')
    assert out == 'Text:\n{{ $json.input_text }}\n{\n  "MajorClaim": [{"text": "..."}]\n}'


def test_real_old_prompts_convert_cleanly():
    for name in ("L1_extraction", "argument_classification", "L2_entities",
                 "concept_constructor", "concept_validation"):
        text = (render.HERE / "prompts" / f"{name}.user.txt").read_text()
        out = render.user_prompt_to_n8n(text)
        # Python's own formatter agrees on the literal parts.
        fields = {f: "{{ $json.%s }}" % f for f in
                  ("input_text", "TEXT", "ARG_ID", "FULL_ARGUMENT", "list_of_args", "list_of_concepts")}
        assert out == text.format(**fields)


def test_system_prompt_is_inlined_verbatim_into_a_fixed_field(monkeypatch):
    raw = (render.HERE / "prompts" / "L1_extraction.system.txt").read_text()
    assert render.resolve("PROMPT", "L1_extraction.system", False, "x") == raw
    with pytest.raises(SystemExit):
        render.resolve("PROMPT", "L1_extraction.system", True, "x")
    with pytest.raises(SystemExit):
        render.resolve("PROMPT", "L1_extraction.user", False, "x")


def test_render_walks_strings_and_env(monkeypatch):
    monkeypatch.setenv("OLLAMA_MODEL", "gemma4:31b")
    wf = {"nodes": [{"parameters": {"model": "={{ENV:OLLAMA_MODEL}}", "n": 3}}]}
    assert render.render(wf, "wf") == {"nodes": [{"parameters": {"model": "=gemma4:31b", "n": 3}}]}


def test_render_refuses_foreign_or_idless_workflows(tmp_path, monkeypatch):
    wf_dir = tmp_path / "workflows"
    wf_dir.mkdir()
    monkeypatch.setattr(render, "HERE", tmp_path)
    (wf_dir / "graphvisor_x.json").write_text(json.dumps({"id": "abc", "name": "I1: other"}))
    with pytest.raises(SystemExit, match="not graphvisor_"):
        render.main(str(tmp_path / "out"))
    (wf_dir / "graphvisor_x.json").write_text(json.dumps({"name": "graphvisor_x"}))
    with pytest.raises(SystemExit, match="no id"):
        render.main(str(tmp_path / "out"))
