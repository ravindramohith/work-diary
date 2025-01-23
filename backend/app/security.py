from cryptography.fernet import Fernet
from dotenv import load_dotenv
import os

load_dotenv()
fernet = Fernet(os.getenv("ENCRYPTION_KEY"))


def encrypt_token(token: str) -> bytes:
    return fernet.encrypt(token.encode())


def decrypt_token(encrypted_token: bytes) -> str:
    return fernet.decrypt(encrypted_token).decode()
