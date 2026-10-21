import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

UPLOAD_DIR = BASE_DIR / "static" / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = BASE_DIR / "store_manager.db"

HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "8000"))
DEBUG = os.getenv("DEBUG", "True").lower() in ("true", "1", "yes")

# Gemini API configuration - Defaults to Gemini 3.5 Flash as requested
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash").strip()
APP_MODE = os.getenv("APP_MODE", "live" if GEMINI_API_KEY else "demo")

def get_gemini_api_key() -> str:
    global GEMINI_API_KEY
    return GEMINI_API_KEY or os.getenv("GEMINI_API_KEY", "").strip()

def get_gemini_model() -> str:
    global GEMINI_MODEL
    return GEMINI_MODEL or os.getenv("GEMINI_MODEL", "gemini-3.5-flash").strip()

def set_gemini_config(key: str = None, model: str = None) -> None:
    global GEMINI_API_KEY, GEMINI_MODEL, APP_MODE
    if key is not None:
        GEMINI_API_KEY = key.strip()
    if model is not None and model.strip():
        GEMINI_MODEL = model.strip()
    
    if GEMINI_API_KEY:
        APP_MODE = "live"

    # Persist in .env
    env_file = BASE_DIR / ".env"
    lines = []
    has_key = False
    has_model = False

    if env_file.exists():
        with open(env_file, "r", encoding="utf-8") as f:
            for line in f:
                if line.startswith("GEMINI_API_KEY="):
                    lines.append(f"GEMINI_API_KEY={GEMINI_API_KEY}\n")
                    has_key = True
                elif line.startswith("GEMINI_MODEL="):
                    lines.append(f"GEMINI_MODEL={GEMINI_MODEL}\n")
                    has_model = True
                else:
                    lines.append(line)

    if not has_key:
        lines.append(f"GEMINI_API_KEY={GEMINI_API_KEY}\n")
    if not has_model:
        lines.append(f"GEMINI_MODEL={GEMINI_MODEL}\n")

    with open(env_file, "w", encoding="utf-8") as f:
        f.writelines(lines)

def set_gemini_api_key(key: str) -> None:
    set_gemini_config(key=key)

def set_gemini_model(model: str) -> None:
    set_gemini_config(model=model)
