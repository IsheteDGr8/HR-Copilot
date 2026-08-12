from fastapi import APIRouter, Depends, HTTPException, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any
from core.agent.loop import AgentLoop
from api.v1.integrations import router as integrations_router
from services.communications import communications_service

api_router = APIRouter()
api_router.include_router(integrations_router)
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

        # Prefer native Gmail OAuth tool when connected; fall back to mock comms.
        from core.agent.tools import send_email as send_email_tool

        result = await send_email_tool(to=to, subject=subject, body=body)
        if isinstance(result, dict) and result.get("ok"):
            return {
                "status": "success",
                "message": result.get("message") or "Email sent successfully",
                "result": result,
            }
        if isinstance(result, str) and "not connected" in result.lower():
            # Keep canvas approvals usable in local/dev without Gmail linked.
            success = await communications_service.send_email(to, subject, body)
            if success:
                return {
                    "status": "success",
                    "message": "Email sent via mock transport (Gmail not connected).",
                    "gmail_connected": False,
                }
            raise HTTPException(status_code=400, detail=result)
        if isinstance(result, dict) and result.get("error"):
            raise HTTPException(status_code=500, detail=result["error"])

        success = await communications_service.send_email(to, subject, body)
        if success:
            return {"status": "success", "message": "Email sent successfully"}
        raise HTTPException(status_code=500, detail="Failed to send email")

    raise HTTPException(status_code=400, detail=f"Unknown action type: {action.action_type}")
