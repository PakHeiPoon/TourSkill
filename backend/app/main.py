from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers.health import router as health_router
from app.routers.mcp import router as mcp_router
from app.routers.merchant import router as merchant_router

app = FastAPI(title="TourSkill Registry API")

# Public API — agents call from varied origins (Claude Code, Cursor, browser
# frontends). Allow all origins; credentials disabled (incompatible with "*"
# wildcard per the CORS spec anyway).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(health_router)
app.include_router(merchant_router, prefix="/v1", tags=["merchant"])
app.include_router(mcp_router, prefix="/mcp", tags=["mcp"])
