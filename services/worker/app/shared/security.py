"""Secrets: passwords (Argon2id), session tokens and access codes (stored as
SHA-256 hashes; the plain values are only ever held by the user)."""

import hashlib
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

_hasher = PasswordHasher()  # Argon2id with the library's recommended parameters
_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O, 1/I


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def new_token() -> str:
    return secrets.token_urlsafe(32)


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def normalize_code(code: str) -> str:
    return "".join(ch for ch in code.upper() if ch.isalnum())


def new_code() -> str:
    """GV-XXXX-XXXX-XXXX: about 60 bits of randomness."""
    groups = ["".join(secrets.choice(_CODE_ALPHABET) for _ in range(4)) for _ in range(3)]
    return "GV-" + "-".join(groups)


def code_hash(code: str) -> str:
    return sha256(normalize_code(code))
