from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.config import get_gemini_api_key, get_gemini_model, set_gemini_config, APP_MODE

router = APIRouter(prefix="/api/settings", tags=["Settings"])

class SettingsUpdate(BaseModel):
    api_key: Optional[str] = None
    model: Optional[str] = None

@router.get("")
async def get_settings():
    key = get_gemini_api_key()
    model = get_gemini_model()
    masked_key = ""
    if key:
        masked_key = key[:6] + "..." + key[-4:] if len(key) > 10 else "***"
    return {
        "success": True,
        "has_api_key": bool(key),
        "masked_api_key": masked_key,
        "mode": "live" if key else "demo",
        "model": model,
        "available_models": [
            {"id": "gemini-3.5-flash", "name": "Gemini 3.5 Flash (Recommended - High Rate Limits)", "recommended": True},
            {"id": "gemini-3.8-flash", "name": "Gemini 3.8 Flash (High Performance)"},
            {"id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash"},
            {"id": "gemini-2.0-flash", "name": "Gemini 2.0 Flash"},
            {"id": "gemini-1.5-flash", "name": "Gemini 1.5 Flash"}
        ]
    }

@router.post("/gemini-key")
async def update_settings(payload: SettingsUpdate):
    key = (payload.api_key or "").strip()
    model = (payload.model or get_gemini_model()).strip()
    
    current_key = get_gemini_api_key()
    active_key = key if key else current_key

    if not active_key and not payload.model:
        raise HTTPException(status_code=400, detail="API key or model selection is required.")

    set_gemini_config(key=active_key, model=model)

    # Test connection if active key is present
    if active_key:
        try:
            from google import genai
            client = genai.Client(api_key=active_key)
            test_resp = client.models.generate_content(
                model=model,
                contents="Reply with OK"
            )
            return {
                "success": True,
                "message": f"Connected to {model} successfully!",
                "mode": "live",
                "model": model
            }
        except Exception as e:
            return {
                "success": True,
                "message": f"Config saved for {model}. (Validation notice: {str(e)[:100]})",
                "mode": "live",
                "model": model
            }

    return {
        "success": True,
        "message": f"Settings saved! Active model: {model}",
        "mode": "demo",
        "model": model
    }
