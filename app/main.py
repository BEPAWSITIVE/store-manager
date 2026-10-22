import os
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, FileResponse
from pathlib import Path

from app.config import (
    BASE_DIR, HOST, PORT, DEBUG,
    UPLOAD_DIR,
    get_gemini_api_key, get_gemini_model, APP_MODE
)
from app.database import init_db
from app.routes import scanner, inventory, settings

app = FastAPI(
    title="StoreScan AI - Smart Store & Stock Manager",
    description="Multi-angle AI product scanning, automated rack & box counting, and stock inventory management.",
    version="1.0.0"
)

# Export handler for Vercel Serverless
handler = app

@app.middleware("http")
async def fix_vercel_path_middleware(request: Request, call_next):
    # Normalize Vercel URL rewrite prefixes so FastAPI routes match cleanly
    path = request.scope.get("path", "")
    for prefix in ["/app/main.py", "/app/main", "/api/index.py", "/api/index"]:
        if path == prefix:
            request.scope["path"] = "/"
            break
        elif path.startswith(prefix + "/"):
            request.scope["path"] = path[len(prefix):]
            break
    return await call_next(request)

# Static and templates
static_dir = BASE_DIR / "static"
templates_dir = BASE_DIR / "templates"

# Endpoint to serve uploads from both static/uploads and /tmp/uploads on Vercel
@app.get("/static/uploads/{filename}")
async def serve_upload(filename: str):
    # Check in temp uploads first (where new uploads go on Vercel)
    tmp_file = UPLOAD_DIR / filename
    if tmp_file.exists():
        return FileResponse(tmp_file)
    # Check in local static uploads
    static_file = static_dir / "uploads" / filename
    if static_file.exists():
        return FileResponse(static_file)
    # Fallback to store shelf preview
    fallback_file = static_dir / "uploads" / "store_shelf_preview.jpg"
    if fallback_file.exists():
        return FileResponse(fallback_file)
    return FileResponse(static_file)

if static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

templates = Jinja2Templates(directory=str(templates_dir))

# Initialize database schema and seed data safely
try:
    init_db()
except Exception as e:
    print("[Database Init Notice]", e)

# Include API routes
app.include_router(scanner.router)
app.include_router(inventory.router)
app.include_router(settings.router)

@app.get("/", response_class=HTMLResponse)
async def home_page(request: Request):
    """Home / Product & Rack Scanner page with the empty box viewfinder."""
    return templates.TemplateResponse(
        request=request,
        name="scanner.html",
        context={
            "page_title": "AI Product & Rack Scanner",
            "active_tab": "scanner",
            "has_api_key": bool(get_gemini_api_key()),
            "gemini_model": get_gemini_model(),
            "app_mode": APP_MODE
        }
    )

@app.get("/scanner", response_class=HTMLResponse)
async def scanner_page(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="scanner.html",
        context={
            "page_title": "AI Product & Rack Scanner",
            "active_tab": "scanner",
            "has_api_key": bool(get_gemini_api_key()),
            "gemini_model": get_gemini_model(),
            "app_mode": APP_MODE
        }
    )

@app.get("/review", response_class=HTMLResponse)
async def review_page(request: Request):
    """Product & Inventory Review page with captured details."""
    return templates.TemplateResponse(
        request=request,
        name="review.html",
        context={
            "page_title": "Product & Inventory Review",
            "active_tab": "scanner",
            "has_api_key": bool(get_gemini_api_key()),
            "gemini_model": get_gemini_model(),
            "app_mode": APP_MODE
        }
    )

@app.get("/inventory", response_class=HTMLResponse)
async def inventory_page(request: Request):
    """Stock Manager dashboard page."""
    return templates.TemplateResponse(
        request=request,
        name="inventory.html",
        context={
            "page_title": "Stock Manager - Available Inventory",
            "active_tab": "inventory",
            "has_api_key": bool(get_gemini_api_key()),
            "gemini_model": get_gemini_model(),
            "app_mode": APP_MODE
        }
    )
