import os
import json
import asyncio
from typing import AsyncGenerator
from pydantic import BaseModel
from typing import Any, Dict
from litellm import acompletion
from core.agent.registry import registry
import core.agent.tools
from core.security.guardrails import guardrails

class CanvasUpdateEvent(BaseModel):
    view: str
    data: Dict[str, Any]

class AgentLoop:
    def __init__(self):
        self.model = os.getenv("LLM_MODEL", "gemini/gemini-3.6-flash")
        
    async def run_stream(self, prompt: str) -> AsyncGenerator[str, None]:
        # Validate prompt using guardrails
        try:
            guardrails.validate_prompt(prompt)
        except Exception as e:
            yield f"data: {json.dumps({'event': 'delta', 'data': str(e)})}\n\n"
            yield f"data: {json.dumps({'event': 'done'})}\n\n"
            return

        messages = [
            {"role": "system", "content": guardrails.system_prompt_template},
            {"role": "user", "content": prompt}
        ]

        # Dynamic tools list injection (ready for MCP)
        tools = registry.to_openai_tools()
        max_turns = 5

        for turn in range(max_turns):
            try:
                response = await acompletion(
                    model=self.model,
                    messages=messages,
                    tools=tools,
                    stream=True
                )
                
                tool_calls_buffer = {}
                assistant_content = ""

                async for chunk in response:
                    delta = chunk.choices[0].delta
                    
                    if hasattr(delta, 'content') and delta.content:
                        assistant_content += delta.content
                        yield f"data: {json.dumps({'event': 'delta', 'data': delta.content})}\n\n"
                    
                    if hasattr(delta, 'tool_calls') and delta.tool_calls:
                        for tc in delta.tool_calls:
                            idx = tc.index
                            if idx not in tool_calls_buffer:
                                tool_calls_buffer[idx] = {
                                    "id": tc.id,
                                    "type": "function",
                                    "function": {
                                        "name": tc.function.name,
                                        "arguments": tc.function.arguments or ""
                                    }
                                }
                            else:
                                if tc.function.arguments:
                                    tool_calls_buffer[idx]["function"]["arguments"] += tc.function.arguments

                # If there are no tool calls, the agent has finished its task
                if not tool_calls_buffer:
                    break
                    
                # Append the assistant's message with tool calls to the history
                assistant_message = {"role": "assistant"}
                if assistant_content:
                    assistant_message["content"] = assistant_content
                    
                # Format tool calls for LiteLLM/OpenAI schema
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
                        # Execute the tool gracefully
                        result = await registry.execute(name, arguments)
                        tool_result_str = json.dumps(result)
                        yield f"data: {json.dumps({'event': 'tool_end', 'tool': name, 'result': result})}\n\n"
                        
                        # Surface structured tool results on the Side Canvas.
                        # Skip error payloads so the LLM can self-correct quietly.
                        canvas_view = None
                        if isinstance(result, dict) and not result.get("error"):
                            if name == "trigger_onboarding":
                                canvas_view = "ONBOARDING_CHECKLIST"
                            elif name == "update_provisioning_status":
                                canvas_view = "ONBOARDING_CHECKLIST"
                            elif name == "generate_offer_letter":
                                canvas_view = "DOCUMENT_CREATION"

                        if canvas_view:
                            canvas_event = CanvasUpdateEvent(view=canvas_view, data=result)
                            yield f"data: {json.dumps({'event': 'canvas_update', 'data': canvas_event.model_dump()})}\n\n"
                    except Exception as tool_e:
                        tool_result_str = json.dumps({"error": str(tool_e)})
                        yield f"data: {json.dumps({'event': 'tool_end', 'tool': name, 'error': str(tool_e)})}\n\n"
                        
                    # Append the tool execution result to the history
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call_id,
                        "name": name,
                        "content": tool_result_str
                    })

            except Exception as e:
                yield f"data: {json.dumps({'event': 'delta', 'data': f'Error: {str(e)}'})}\n\n"
                break
                
        yield f"data: {json.dumps({'event': 'done'})}\n\n"
