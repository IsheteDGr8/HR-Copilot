from fastapi import APIRouter, Depends, HTTPException, Header
from fastapi.responses import StreamingResponse
from typing import Optional
from core.agent.loop import AgentLoop

api_router = APIRouter()
agent = AgentLoop()

async def verify_jwt(authorization: Optional[str] = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header missing")
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header format")
    token = authorization.split(" ")[1]
    # In a real app, validate token with Azure Entra ID
    if not token:
        raise HTTPException(status_code=401, detail="Token missing")
    return {"user_id": "test_user"}

@api_router.post("/chat/stream")
async def chat_stream_endpoint(message: str, user: dict = Depends(verify_jwt)):
    """
    SSE endpoint for streaming LLM response and tool/canvas events.
    """
    return StreamingResponse(
        agent.run_stream(message), 
        media_type="text/event-stream"
    )
