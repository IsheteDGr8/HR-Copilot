import os
import json
import asyncio
from typing import AsyncGenerator
from pydantic import BaseModel
from typing import Any, Dict
from litellm import acompletion
from core.agent.tools import registry
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

        tools = registry.schemas

        try:
            response = await acompletion(
                model=self.model,
                messages=messages,
                tools=tools,
                stream=True
            )

            tool_calls_buffer = {}

            async for chunk in response:
                delta = chunk.choices[0].delta
                
                if hasattr(delta, 'content') and delta.content:
                    yield f"data: {json.dumps({'event': 'delta', 'data': delta.content})}\n\n"
                
                if hasattr(delta, 'tool_calls') and delta.tool_calls:
                    for tc in delta.tool_calls:
                        idx = tc.index
                        if idx not in tool_calls_buffer:
                            tool_calls_buffer[idx] = {
                                "id": tc.id,
                                "name": tc.function.name,
                                "arguments": tc.function.arguments or ""
                            }
                        else:
                            if tc.function.arguments:
                                tool_calls_buffer[idx]["arguments"] += tc.function.arguments

            # Process tool calls if any
            if tool_calls_buffer:
                for idx, tc in tool_calls_buffer.items():
                    name = tc["name"]
                    arguments = json.loads(tc["arguments"])
                    
                    yield f"data: {json.dumps({'event': 'tool_start', 'tool': name, 'args': arguments})}\n\n"
                    
                    func = registry.tools.get(name)
                    if func:
                        # Execute the tool
                        result = await func(**arguments)
                        
                        yield f"data: {json.dumps({'event': 'tool_end', 'tool': name, 'result': result})}\n\n"
                        
                        # Generate canvas event based on tool
                        canvas_view = None
                        if name == "lookup_employee":
                            canvas_view = "EMPLOYEE_PROFILE"
                        elif name == "get_pto_balance":
                            canvas_view = "LEAVE_BREAKDOWN"
                        elif name == "draft_email":
                            canvas_view = "EMAIL_DRAFT"
                            
                        if canvas_view:
                            canvas_event = CanvasUpdateEvent(view=canvas_view, data=result)
                            yield f"data: {json.dumps({'event': 'canvas_update', 'data': canvas_event.model_dump()})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'event': 'delta', 'data': f'Error: {str(e)}'})}\n\n"
            
        yield f"data: {json.dumps({'event': 'done'})}\n\n"
