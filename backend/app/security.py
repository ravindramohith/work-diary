import os
from cryptography.fernet import Fernet
from dotenv import load_dotenv

load_dotenv()
# Get key from environment or generate one if not exists
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY").encode()
if not ENCRYPTION_KEY:
    print("Warning: ENCRYPTION_KEY not found in environment. Generating a new one...")
    print("Please add this key to your .env file:")
    print(Fernet.generate_key().decode())
    ENCRYPTION_KEY = Fernet.generate_key()
else:
    # If key is provided as string in .env, encode it to bytes
    ENCRYPTION_KEY = (
        ENCRYPTION_KEY.encode() if isinstance(ENCRYPTION_KEY, str) else ENCRYPTION_KEY
    )
fernet = Fernet(ENCRYPTION_KEY)


def encrypt_token(token: str) -> bytes:
    try:
        return fernet.encrypt(token.encode())
    except Exception as e:
        print(f"Error encrypting token: {e}")
        raise e


def decrypt_token(encrypted_token: bytes) -> str:
    try:
        return fernet.decrypt(encrypted_token).decode()
    except Exception as e:
        print(f"Error decrypting token: {e}")
        raise e
