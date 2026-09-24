"""Serve a document's PDF to n8n, which forwards it to the OCR service."""

from fastapi import APIRouter, HTTPException, Path
from fastapi.responses import FileResponse

from app.shared.config import settings
from app.shared.models import COLLECTION_PATTERN, ID_PATTERN

router = APIRouter()


@router.get("/documents/{collection}/{doc_id}/pdf")
def pdf(collection: str = Path(pattern=COLLECTION_PATTERN),
        doc_id: str = Path(pattern=ID_PATTERN)):
    path = settings().input_dir / collection / f"{doc_id}.pdf"
    if not path.is_file():
        raise HTTPException(404, f"no {path}")
    return FileResponse(path, media_type="application/pdf", filename=path.name)
