from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv(override=True)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.v1.router import api_router
from api.v1.auth import router as auth_router
from core.agent.mcp_client import init_gmail_mcp, shutdown_gmail_mcp


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Inject Gmail MCP tools into the agent registry before serving traffic.
    await init_gmail_mcp()
    try:
        yield
    finally:
        await shutdown_gmail_mcp()


app = FastAPI(
    title="HR Copilot API",
    description="Enterprise-grade AI HR Copilot backend.",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS Configuration
# Allow all origins for development, should be restricted in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")
app.include_router(auth_router)


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
