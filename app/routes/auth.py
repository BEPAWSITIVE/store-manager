from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional, Dict, Any

from app.config import (
    get_supabase_url,
    get_supabase_key,
    set_supabase_config,
    is_supabase_configured
)
from app.supabase_client import (
    sb_auth_login,
    sb_auth_signup,
    test_supabase_connection
)
from app.database import sync_local_to_supabase

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

class LoginRequest(BaseModel):
    email: str
    password: str

class SignupRequest(BaseModel):
    email: str
    password: str
    role: Optional[str] = "manager"

class SupabaseConfigRequest(BaseModel):
    url: str
    key: str
    sync_existing: Optional[bool] = False

# Default built-in accounts for easy out-of-the-box operation
DEFAULT_ACCOUNTS = {
    "manager@gmail.com": {
        "password": "manager123",
        "role": "manager",
        "name": "Store Manager",
        "redirect_url": "/scan"
    },
    "manager@store.com": {
        "password": "manager123",
        "role": "manager",
        "name": "Store Manager",
        "redirect_url": "/scan"
    },
    "manager": {
        "password": "manager123",
        "role": "manager",
        "name": "Store Manager",
        "redirect_url": "/scan"
    },
    "cashier@gmail.com": {
        "password": "billing123",
        "role": "billing",
        "name": "Billing Staff",
        "redirect_url": "/billing"
    },
    "cashier@store.com": {
        "password": "billing123",
        "role": "billing",
        "name": "Billing Staff",
        "redirect_url": "/billing"
    },
    "cashier": {
        "password": "billing123",
        "role": "billing",
        "name": "Billing Staff",
        "redirect_url": "/billing"
    },
    "billing": {
        "password": "billing123",
        "role": "billing",
        "name": "Billing Staff",
        "redirect_url": "/billing"
    },
    "admin@store.com": {
        "password": "admin123",
        "role": "admin",
        "name": "Administrator",
        "redirect_url": "/scan"
    },
    "admin": {
        "password": "admin123",
        "role": "admin",
        "name": "Administrator",
        "redirect_url": "/scan"
    }
}

@router.get("/status")
async def get_auth_status():
    is_sb = is_supabase_configured()
    masked_key = ""
    key = get_supabase_key()
    if key:
        masked_key = key[:6] + "..." + key[-4:] if len(key) > 10 else "***"
    return {
        "supabase_configured": is_sb,
        "supabase_url": get_supabase_url(),
        "masked_supabase_key": masked_key,
        "mode": "supabase" if is_sb else "local",
        "demo_accounts": [
            {"label": "Store Manager", "email": "manager@store.com", "password": "manager123", "role": "manager", "target": "Scan & Stock"},
            {"label": "Billing / Cashier", "email": "cashier@store.com", "password": "billing123", "role": "billing", "target": "Billing POS"}
        ]
    }

@router.post("/login")
async def login(payload: LoginRequest):
    email = payload.email.strip().lower()
    password = payload.password

    # 1. If Supabase is configured, try Supabase Auth first
    if is_supabase_configured():
        ok, user_data, msg = sb_auth_login(email, password)
        if ok:
            role = user_data.get("role", "manager")
            redirect_url = "/billing" if role == "billing" else "/scan"
            return {
                "success": True,
                "provider": "supabase",
                "message": msg,
                "user": user_data,
                "redirect_url": redirect_url
            }
        # If Supabase Auth failed, check if default credentials match for fallback
        print(f"[Supabase Auth notice]: {msg}, checking local fallback...")

    # 2. Local fallback / demo accounts
    if email in DEFAULT_ACCOUNTS:
        acc = DEFAULT_ACCOUNTS[email]
        if acc["password"] == password:
            return {
                "success": True,
                "provider": "local",
                "message": f"Welcome {acc['name']}!",
                "user": {
                    "email": email if "@" in email else f"{email}@store.com",
                    "role": acc["role"],
                    "name": acc["name"],
                    "access_token": f"local_token_{acc['role']}"
                },
                "redirect_url": acc["redirect_url"]
            }
        else:
            raise HTTPException(status_code=401, detail="Incorrect password. For Store Manager use 'manager123', for Cashier use 'billing123'.")

    # If Supabase configured and didn't match local
    if is_supabase_configured():
        raise HTTPException(status_code=401, detail="Invalid Supabase Auth credentials.")

    raise HTTPException(
        status_code=401,
        detail="User not found. Use 'manager@store.com' (pwd: manager123) for Store Manager, or 'cashier@store.com' (pwd: billing123) for Billing Staff."
    )

@router.post("/signup")
async def signup(payload: SignupRequest):
    if not is_supabase_configured():
        raise HTTPException(status_code=400, detail="Connect Supabase first to register new staff accounts in Supabase Auth.")
    
    ok, data, msg = sb_auth_signup(payload.email, payload.password, payload.role or "manager")
    if ok:
        return {
            "success": True,
            "message": "Staff account registered in Supabase Auth! You can now log in.",
            "data": data
        }
    raise HTTPException(status_code=400, detail=msg)

@router.post("/config-supabase")
async def configure_supabase(payload: SupabaseConfigRequest):
    url = payload.url.strip().rstrip("/")
    key = payload.key.strip()
    
    if not url.startswith("http"):
        raise HTTPException(status_code=400, detail="Supabase URL must start with https://")
    if not key:
        raise HTTPException(status_code=400, detail="Supabase API Key (anon or service_role) is required.")

    set_supabase_config(url=url, key=key)
    ok, msg = test_supabase_connection()

    sync_msg = ""
    if ok and payload.sync_existing:
        count, s_msg = sync_local_to_supabase()
        sync_msg = f" Also {s_msg}"

    return {
        "success": ok,
        "message": f"{msg}{sync_msg}",
        "supabase_url": url
    }
