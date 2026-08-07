from fastapi import APIRouter, Depends, HTTPException, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any
from core.agent.loop import AgentLoop
from services.communications import communications_service

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

class ActionRequest(BaseModel):
    action_type: str
    payload: Dict[str, Any]

@api_router.post("/actions/execute")
async def execute_action(action: ActionRequest, user: dict = Depends(verify_jwt)):
    """
    Endpoint for the frontend to execute an approved action (e.g. sending an email).
    """
    if action.action_type == "send_email":
        to = action.payload.get("to")
        subject = action.payload.get("subject")
        body = action.payload.get("body")
        
        if not to or not subject or not body:
            raise HTTPException(status_code=400, detail="Missing email parameters")
            
        success = await communications_service.send_email(to, subject, body)
        if success:
            return {"status": "success", "message": "Email sent successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to send email")
            
    raise HTTPException(status_code=400, detail=f"Unknown action type: {action.action_type}")
