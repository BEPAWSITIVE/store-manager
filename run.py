import uvicorn
import os
import sys

if __name__ == "__main__":
    print("=" * 60)
    print("  StoreScan AI - Smart Store & Stock Manager")
    print("  Visual Multi-Angle Scanning + Rack Box Counter")
    print("=" * 60)
    print("  URL: http://127.0.0.1:8000")
    print("  Stock Manager: http://127.0.0.1:8000/inventory")
    print("=" * 60)
    
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=8000,
        reload=True
    )
