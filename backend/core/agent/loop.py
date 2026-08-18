import os
import json
from typing import AsyncGenerator, Any, Dict, List, Optional

from pydantic import BaseModel
from litellm import acompletion
from core.agent.registry import registry
from core.litellm_compat import ensure_litellm_models

ensure_litellm_models()
import core.agent.tools
from core.security.guardrails import guardrails


class CanvasUpdateEvent(BaseModel):
    view: str
    data: Dict[str, Any]


# Cap prior turns so oversized localStorage histories don't blow the context window.
_MAX_HISTORY_MESSAGES = 40
_MAX_HISTORY_CHARS = 12_000


def _normalize_history(history: Optional[List[Dict[str, Any]]]) -> List[Dict[str, str]]:
    """Keep only user/assistant text turns suitable for the LLM messages array."""
    if not history:
        return []
    out: List[Dict[str, str]] = []
    for item in history:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role") or "").strip().lower()
        if role not in ("user", "assistant"):
            continue
        content = item.get("content")
        if content is None:
            continue
        text = str(content).strip()
        if not text:
            continue
        if len(text) > _MAX_HISTORY_CHARS:
            text = text[:_MAX_HISTORY_CHARS] + "\n…[truncated]"
        out.append({"role": role, "content": text})
    if len(out) > _MAX_HISTORY_MESSAGES:
        out = out[-_MAX_HISTORY_MESSAGES:]
    return out


def _resolve_llm() -> Dict[str, Any]:
    """Build LiteLLM kwargs from env (Azure Foundry / OpenAI-compatible preferred)."""
    provider = (os.getenv("LLM_PROVIDER") or "").strip().lower()

    # Explicit OpenAI-compatible path (Azure AI Foundry serverless, etc.)
    if provider in ("openai", "azure_foundry", "foundry") or os.getenv("OPENAI_API_KEY"):
        model = (
            os.getenv("OPENAI_MODEL")
            or os.getenv("LLM_MODEL")
            or "gpt-4o"
        ).strip()
        # LiteLLM routes openai/* (or bare OpenAI model names) to the OpenAI client.
        if "/" not in model:
            model = f"openai/{model}"
        kwargs: Dict[str, Any] = {"model": model}
        api_key = os.getenv("OPENAI_API_KEY")
        api_base = os.getenv("OPENAI_BASE_URL") or os.getenv("OPENAI_API_BASE")
        if api_key:
            kwargs["api_key"] = api_key
        if api_base:
            kwargs["api_base"] = api_base.rstrip("/")
        return kwargs

    # Legacy Gemini / LLM_MODEL fallback
    model = (os.getenv("LLM_MODEL") or "openai/gpt-4o").strip()
    kwargs = {"model": model}
    if model.startswith("gemini/"):
        gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if gemini_key:
            kwargs["api_key"] = gemini_key
    elif os.getenv("OPENAI_API_KEY"):
        kwargs["api_key"] = os.getenv("OPENAI_API_KEY")
        api_base = os.getenv("OPENAI_BASE_URL") or os.getenv("OPENAI_API_BASE")
        if api_base:
            kwargs["api_base"] = api_base.rstrip("/")
    return kwargs


class AgentLoop:
    def __init__(self):
        self.llm_kwargs = _resolve_llm()
        self.model = self.llm_kwargs["model"]

    async def run_stream(
        self,
        prompt: str,
        history: Optional[List[Dict[str, Any]]] = None,
    ) -> AsyncGenerator[str, None]:
        # Validate prompt using guardrails
        try:
            guardrails.validate_prompt(prompt)
        except Exception as e:
            yield f"data: {json.dumps({'event': 'delta', 'data': str(e)})}\n\n"
            yield f"data: {json.dumps({'event': 'done'})}\n\n"
            return

        # Full conversational context every turn (fixes goldfish memory).
        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": guardrails.system_prompt_template},
            *_normalize_history(history),
            {"role": "user", "content": prompt},
        ]

        # Dynamic tools list injection (ready for MCP)
        tools = registry.to_openai_tools()
        max_turns = 5

        for turn in range(max_turns):
            try:
                response = await acompletion(
                    messages=messages,
                    tools=tools,
                    stream=True,
                    **self.llm_kwargs,
                )

                tool_calls_buffer = {}
                assistant_content = ""

                async for chunk in response:
                    delta = chunk.choices[0].delta

                    if hasattr(delta, "content") and delta.content:
                        assistant_content += delta.content
                        yield f"data: {json.dumps({'event': 'delta', 'data': delta.content})}\n\n"

                    if hasattr(delta, "tool_calls") and delta.tool_calls:
                        for tc in delta.tool_calls:
                            idx = tc.index
                            if idx not in tool_calls_buffer:
                                tool_calls_buffer[idx] = {
                                    "id": tc.id,
                                    "type": "function",
                                    "function": {
                                        "name": tc.function.name,
                                        "arguments": tc.function.arguments or "",
                                    },
                                }
                            else:
                                if tc.function.arguments:
                                    tool_calls_buffer[idx]["function"]["arguments"] += (
                                        tc.function.arguments
                                    )

                # If there are no tool calls, the agent has finished its task
                if not tool_calls_buffer:
                    break

                # Append the assistant's message with tool calls to the history
                assistant_message: Dict[str, Any] = {"role": "assistant"}
                if assistant_content:
                    assistant_message["content"] = assistant_content

                formatted_tool_calls = []
                for idx, tc in tool_calls_buffer.items():
                    formatted_tool_calls.append(tc)
                assistant_message["tool_calls"] = formatted_tool_calls
                messages.append(assistant_message)

                # Execute tools and append results
                for idx, tc in tool_calls_buffer.items():
                    name = tc["function"]["name"]
                    tool_call_id = tc["id"]
                    try:
                        arguments = json.loads(tc["function"]["arguments"])
                    except json.JSONDecodeError:
                        arguments = {}

                    yield f"data: {json.dumps({'event': 'tool_start', 'tool': name, 'args': arguments})}\n\n"

                    tool_result_str = ""
                    try:
                        result = await registry.execute(name, arguments)
                        # Pass Python-authored drafts to the model verbatim so it
                        # cannot invent a replacement email. Canvas still gets the
                        # full dict via canvas_update.
                        if (
                            name == "prepare_onboarding_packet"
                            and isinstance(result, dict)
                            and isinstance(result.get("drafted_email"), str)
                        ):
                            tool_result_str = (
                                result.get("message")
                                or (
                                    "Onboarding packet prepared. STOP. Do not generate or rewrite the email. "
                                    "The exact drafted email injected into the UI was:\n\n"
                                    f"{result['drafted_email']}\n\n"
                                    "Tell the user to review the Side Canvas."
                                )
                            )
                        elif (
                            name == "draft_email"
                            and isinstance(result, dict)
                            and isinstance(result.get("message"), str)
                        ):
                            tool_result_str = result["message"]
                        else:
                            tool_result_str = (
                                result
                                if isinstance(result, str)
                                else json.dumps(result)
                            )
                        yield f"data: {json.dumps({'event': 'tool_end', 'tool': name, 'result': result})}\n\n"

                        canvas_view = None
                        if isinstance(result, dict) and not result.get("error"):
                            if name in (
                                "trigger_onboarding",
                                "update_provisioning_status",
                                "prepare_onboarding_packet",
                            ):
                                canvas_view = "ONBOARDING_WORKFLOW"
                            elif name == "generate_offer_letter":
                                canvas_view = "DOCUMENT_CREATION"
                            elif name == "screen_candidates":
                                canvas_view = "RESUME_SCREENING"
                            elif name == "assign_training_module":
                                canvas_view = "TRAINING_TRACKER"
                            elif name == "generate_schedule":
                                canvas_view = "SCHEDULE_MAKER"
                            elif name == "draft_email":
                                canvas_view = "EMAIL_DRAFTER"

                        if canvas_view:
                            canvas_event = CanvasUpdateEvent(view=canvas_view, data=result)
                            yield f"data: {json.dumps({'event': 'canvas_update', 'data': canvas_event.model_dump()})}\n\n"
                    except Exception as tool_e:
                        tool_result_str = json.dumps({"error": str(tool_e)})
                        yield f"data: {json.dumps({'event': 'tool_end', 'tool': name, 'error': str(tool_e)})}\n\n"

                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tool_call_id,
                            "name": name,
                            "content": tool_result_str,
                        }
                    )

            except Exception as e:
                yield f"data: {json.dumps({'event': 'delta', 'data': f'Error: {str(e)}'})}\n\n"
                break

        yield f"data: {json.dumps({'event': 'done'})}\n\n"
