"""Request bodies shared by several routers."""

from pydantic import BaseModel, Field

# Collection names come from input/<collection>/ (lowercase, see input/README.md);
# document ids from <id>.json|.pdf. Both end up in file paths and node uids.
COLLECTION_PATTERN = r"^[a-z0-9_-]+$"
ID_PATTERN = r"^[A-Za-z0-9._-]+$"


class DocRef(BaseModel):
    collection: str = Field(pattern=COLLECTION_PATTERN)
    id: str = Field(pattern=ID_PATTERN)
