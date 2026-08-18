"""FastAPI entrypoint: JWT chat SSE + Google/MSAL auth + mounted FastMCP."""

from contextlib import asynccontextmanager
from typing import Any, Dict

from dotenv import load_dotenv

load_dotenv(override=True)

import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

from fastapi import APIRouter, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI
from pydantic import BaseModel

from api.chat import router as chat_router
from api.v1.auth import router as auth_router
from api.v1.integrations import router as integrations_router
from api.v1.microsoft import router as microsoft_auth_router
from api.v1.onboarding import router as onboarding_router
from api.v1.webhooks import router as webhooks_router
from api.v1.recruiting import router as recruiting_router
from api.v1.helpdesk import router as helpdesk_router
from api.v1.dashboard import router as dashboard_router
from core.agent.user_context import set_current_user_id
from core.security.jwt_auth import verify_jwt
from integrations.gmail_tools import gmail_send
from integrations.server import get_mcp_http_app


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="HR Copilot API",
    description="Multi-agent HR Copilot (orchestrator + workers + execution) with FastMCP SaaS tools.",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_v1 = APIRouter()
api_v1.include_router(chat_router)
api_v1.include_router(integrations_router)
api_v1.include_router(onboarding_router)
api_v1.include_router(webhooks_router)
api_v1.include_router(recruiting_router)
api_v1.include_router(helpdesk_router)
api_v1.include_router(dashboard_router)

app.include_router(api_v1, prefix="/api/v1")
app.include_router(auth_router)
app.include_router(microsoft_auth_router)

_mcp_http = get_mcp_http_app()
if _mcp_http is not None:
    app.mount("/mcp", _mcp_http)


@app.get("/health")
async def health_check():
    return {"status": "healthy", "architecture": "supervisor-worker"}


class ActionRequest(BaseModel):
    action_type: str
    payload: Dict[str, Any]


@app.post("/api/v1/actions/execute")
async def execute_action(action: ActionRequest, user: dict = Depends(verify_jwt)):
    """Canvas-compatible action hook (email send). Prefer HITL chat tags."""
    set_current_user_id(user.get("user_id"))
    if action.action_type == "send_email":
        to = action.payload.get("to")
        subject = action.payload.get("subject")
        body = action.payload.get("body")
        if not to or not subject or not body:
            raise HTTPException(status_code=400, detail="Missing email parameters")
        result = gmail_send(to=to, subject=subject, body=body, user_id=user.get("user_id") or "")
        if isinstance(result, dict) and result.get("ok"):
            return {"status": "success", "result": result}
        raise HTTPException(status_code=500, detail=str(result))
    raise HTTPException(status_code=400, detail=f"Unknown action type: {action.action_type}")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
