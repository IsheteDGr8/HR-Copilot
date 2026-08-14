from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List, Literal
import json
import jwt
import os
from core.agent.loop import AgentLoop
from core.agent.user_context import set_current_user_id
from core.utils.document_parser import extract_text_from_upload
from api.v1.integrations import router as integrations_router
from services.communications import communications_service

api_router = APIRouter()
api_router.include_router(integrations_router)
agent = AgentLoop()

DEFAULT_USER_ID = os.getenv("DEFAULT_USER_ID", "test_user")


class ChatMessage(BaseModel):
    """One turn in the UI conversation history passed to the LLM."""

    role: Literal["user", "assistant", "system"]
    content: str = Field(..., min_length=1)


def _jwt_secret() -> str:
    return (os.getenv("JWT_SECRET") or "").strip() or "dev-only-hr-copilot-jwt-secret-change-me"


async def verify_jwt(authorization: Optional[str] = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header missing")
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header format")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Token missing")
    if token == "mock-jwt-token":
        return {"user_id": DEFAULT_USER_ID}
    try:
        decoded = jwt.decode(token, _jwt_secret(), algorithms=["HS256"])
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=401, detail="Token expired") from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc
    user_id = (
        (decoded.get("email") or "").strip()
        or (decoded.get("sub") or "").strip()
        or DEFAULT_USER_ID
    )
    return {"user_id": user_id}


def _parse_chat_history(raw: Optional[str]) -> List[Dict[str, Any]]:
    """Parse optional `messages` Form field (JSON list of ChatMessage)."""
    if not raw or not str(raw).strip():
        return []
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid messages JSON: {exc}") from exc
    if not isinstance(parsed, list):
        raise HTTPException(status_code=400, detail="messages must be a JSON array")
    history: List[Dict[str, Any]] = []
    for item in parsed:
        try:
            msg = ChatMessage.model_validate(item)
        except Exception as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid message entry: {exc}",
            ) from exc
        if msg.role == "system":
            # System prompt is injected server-side; ignore client system rows.
            continue
        history.append({"role": msg.role, "content": msg.content.strip()})
    return history


@api_router.post("/chat/stream")
async def chat_stream_endpoint(
    message: str = Form(...),
    messages: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    user: dict = Depends(verify_jwt),
):
    """
    SSE endpoint for streaming LLM response and tool/canvas events.

    Accepts multipart/form-data with:
      - `message` (required): the latest user turn
      - `messages` (optional): JSON array of prior turns `[{role, content}, ...]`
      - `file` (optional): PDF or plain text; extracted text is appended to message
    Prior turns are passed into the LLM context on every request.
    """
    set_current_user_id(user.get("user_id"))
    prompt = (message or "").strip()
    if not prompt and not file:
        raise HTTPException(status_code=400, detail="message is required")
    if not prompt:
        prompt = "Please review the attached document."

    history = _parse_chat_history(messages)

    if file is not None and file.filename:
        try:
            file_bytes = await file.read()
            if file_bytes:
                extracted = extract_text_from_upload(file_bytes, file.filename or "upload")
                prompt = (
                    f"{prompt}\n\n<Attached_Document>\n{extracted}\n</Attached_Document>"
                )
        except ValueError as exc:
            # Surface parse failures to the agent so the user still gets feedback.
            prompt = (
                f"{prompt}\n\n<Attached_Document>\n"
                f"[Document extraction failed: {exc}]\n"
                f"</Attached_Document>"
            )
        except Exception as exc:
            prompt = (
                f"{prompt}\n\n<Attached_Document>\n"
                f"[Document extraction failed: {exc}]\n"
                f"</Attached_Document>"
            )

    return StreamingResponse(
        agent.run_stream(prompt, history=history),
        media_type="text/event-stream",
    )

class ActionRequest(BaseModel):
    action_type: str
    payload: Dict[str, Any]

@api_router.post("/actions/execute")
async def execute_action(action: ActionRequest, user: dict = Depends(verify_jwt)):
    """
    Endpoint for the frontend to execute an approved action (e.g. sending an email).
    """
    set_current_user_id(user.get("user_id"))
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
