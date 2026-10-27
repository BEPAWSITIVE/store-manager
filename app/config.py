import os
import tempfile
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

def get_upload_dir() -> Path:
    # On Vercel / serverless, write to /tmp/uploads
    if os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"):
        d = Path(tempfile.gettempdir()) / "uploads"
        d.mkdir(parents=True, exist_ok=True)
        return d
    try:
        d = BASE_DIR / "static" / "uploads"
        d.mkdir(parents=True, exist_ok=True)
        return d
    except Exception:
        d = Path(tempfile.gettempdir()) / "uploads"
        d.mkdir(parents=True, exist_ok=True)
        return d

def get_db_path() -> Path:
    if os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"):
        return Path(tempfile.gettempdir()) / "store_manager.db"
    try:
        test_file = BASE_DIR / ".test_write"
        with open(test_file, "w") as f:
            f.write("ok")
        test_file.unlink()
        return BASE_DIR / "store_manager.db"
    except Exception:
        return Path(tempfile.gettempdir()) / "store_manager.db"

UPLOAD_DIR = get_upload_dir()
DB_PATH = get_db_path()

HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "8000"))
DEBUG = os.getenv("DEBUG", "True").lower() in ("true", "1", "yes")

# Gemini API configuration - Defaults to Gemini 2.5 Flash
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()
APP_MODE = os.getenv("APP_MODE", "live" if GEMINI_API_KEY else "demo")

def get_gemini_api_key() -> str:
    global GEMINI_API_KEY
    return GEMINI_API_KEY or os.getenv("GEMINI_API_KEY", "").strip()

def get_gemini_model() -> str:
    global GEMINI_MODEL
    return GEMINI_MODEL or os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()

def set_gemini_config(key: str = None, model: str = None) -> None:
    global GEMINI_API_KEY, GEMINI_MODEL, APP_MODE
    if key is not None:
        GEMINI_API_KEY = key.strip()
    if model is not None and model.strip():
        GEMINI_MODEL = model.strip()
    
    if GEMINI_API_KEY:
        APP_MODE = "live"

    try:
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
    except Exception:
        # On Vercel / read-only filesystem, ignore writing to .env
        pass

def set_gemini_api_key(key: str) -> None:
    set_gemini_config(key=key)

def set_gemini_model(model: str) -> None:
    set_gemini_config(model=model)

# Supabase configuration for persistent cloud inventory & auth
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "").strip() or os.getenv("SUPABASE_ANON_KEY", "").strip()

def get_supabase_url() -> str:
    global SUPABASE_URL
    return SUPABASE_URL or os.getenv("SUPABASE_URL", "").strip()

def get_supabase_key() -> str:
    global SUPABASE_KEY
    return SUPABASE_KEY or os.getenv("SUPABASE_KEY", "").strip() or os.getenv("SUPABASE_ANON_KEY", "").strip()

def is_supabase_configured() -> bool:
    return bool(get_supabase_url() and get_supabase_key())

def set_supabase_config(url: str = None, key: str = None) -> None:
    global SUPABASE_URL, SUPABASE_KEY
    if url is not None:
        SUPABASE_URL = url.strip().rstrip("/")
    if key is not None:
        SUPABASE_KEY = key.strip()

    try:
        env_file = BASE_DIR / ".env"
        lines = []
        has_url = False
        has_key = False

        if env_file.exists():
            with open(env_file, "r", encoding="utf-8") as f:
                for line in f:
                    if line.startswith("SUPABASE_URL="):
                        lines.append(f"SUPABASE_URL={SUPABASE_URL}\n")
                        has_url = True
                    elif line.startswith("SUPABASE_KEY=") or line.startswith("SUPABASE_ANON_KEY="):
                        lines.append(f"SUPABASE_KEY={SUPABASE_KEY}\n")
                        has_key = True
                    else:
                        lines.append(line)

        if not has_url:
            lines.append(f"SUPABASE_URL={SUPABASE_URL}\n")
        if not has_key:
            lines.append(f"SUPABASE_KEY={SUPABASE_KEY}\n")

        with open(env_file, "w", encoding="utf-8") as f:
            f.writelines(lines)
    except Exception:
        pass

