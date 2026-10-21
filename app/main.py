from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
from pathlib import Path

from app.config import (
    BASE_DIR, HOST, PORT, DEBUG,
    get_gemini_api_key, get_gemini_model, APP_MODE
)
from app.database import init_db
from app.routes import scanner, inventory, settings

app = FastAPI(
    title="StoreScan AI - Smart Store & Stock Manager",
    description="Multi-angle AI product scanning, automated rack & box counting, and stock inventory management.",
    version="1.0.0"
)

# Static and templates
static_dir = BASE_DIR / "static"
templates_dir = BASE_DIR / "templates"

app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")
templates = Jinja2Templates(directory=str(templates_dir))

# Initialize database schema and seed data
init_db()

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
