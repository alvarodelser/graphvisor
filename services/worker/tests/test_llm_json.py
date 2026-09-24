import pytest
from fastapi import HTTPException

from app.shared import llm_json


def test_plain_object():
    assert llm_json.parse('{"a": 1}') == {"a": 1}


def test_fenced_block():
    assert llm_json.parse('```json\n{"a": [1, 2]}\n```') == {"a": [1, 2]}


def test_think_block_is_dropped():
    assert llm_json.parse("<think>reasoning {not json}</think>\n[1]") == [1]


def test_garbage_is_422():
    with pytest.raises(HTTPException) as exc:
        llm_json.parse("Sure! Here are the arguments:")
    assert exc.value.status_code == 422
