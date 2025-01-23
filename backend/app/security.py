from cryptography.fernet import Fernet

fernet = Fernet(Fernet.generate_key())


def encrypt_token(token: str) -> bytes:
    return fernet.encrypt(token.encode())


def decrypt_token(encrypted_token: bytes) -> str:
    return fernet.decrypt(encrypted_token).decode()
