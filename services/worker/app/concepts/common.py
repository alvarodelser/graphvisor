"""Helpers shared by the concept steps."""

import re

from fastapi import HTTPException

from app.shared.models import COLLECTION_PATTERN


def check_collection(collection: str) -> None:
    if not re.match(COLLECTION_PATTERN, collection):
        raise HTTPException(422, f"invalid collection name {collection!r}")
