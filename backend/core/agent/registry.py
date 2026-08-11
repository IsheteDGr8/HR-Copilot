import inspect
from typing import Any, Callable, Dict, List, Optional, get_type_hints

_TYPE_MAP = {
    str: "string",
    int: "integer",
    float: "number",
    bool: "boolean",
    list: "array",
    dict: "object",
}


class ToolDefinition:
    def __init__(self, name: str, description: str, func: Callable, schema: Dict[str, Any]):
        self.name = name
        self.description = description
        self.func = func
        self.schema = schema

    def to_openai_function(self) -> Dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.schema,
            },
        }


class PluginRegistry:
    def __init__(self):
        self._tools: Dict[str, ToolDefinition] = {}

    def register(self, func: Callable) -> Callable:
        name = func.__name__
        description = (func.__doc__ or "").strip() or f"Tool: {name}"
        schema = self._build_schema(func)

        self._tools[name] = ToolDefinition(
            name=name,
            description=description,
            func=func,
            schema=schema,
        )
        return func

    def register_external(
        self,
        name: str,
        description: str,
        schema: Dict[str, Any],
        func: Callable,
    ) -> None:
        """Register a tool with an explicit JSON schema (e.g. MCP-discovered tools)."""
        parameters = schema if schema.get("type") == "object" else {
            "type": "object",
            "properties": schema.get("properties", schema) if isinstance(schema, dict) else {},
            "required": schema.get("required", []) if isinstance(schema, dict) else [],
        }
        # Ensure OpenAI-compatible envelope.
        if "type" not in parameters:
            parameters = {
                "type": "object",
                "properties": parameters.get("properties", {}),
                "required": parameters.get("required", []),
            }
        self._tools[name] = ToolDefinition(
            name=name,
            description=(description or f"Tool: {name}").strip(),
            func=func,
            schema=parameters,
        )

    def _build_schema(self, func: Callable) -> Dict[str, Any]:
        signature = inspect.signature(func)
        hints = get_type_hints(func)

        properties: Dict[str, Any] = {}
        required: List[str] = []

        for param_name, param in signature.parameters.items():
            if param_name in ("self", "context"):
                continue

            annotation = hints.get(param_name, str)
            origin = getattr(annotation, "__origin__", None)
            if annotation is list or origin is list:
                json_type = "array"
                properties[param_name] = {
                    "type": "array",
                    "items": {"type": "string"},
                }
            else:
                json_type = _TYPE_MAP.get(annotation, "string")
                properties[param_name] = {"type": json_type}

            if param.default is inspect.Parameter.empty:
                required.append(param_name)

        return {
            "type": "object",
            "properties": properties,
            "required": required,
        }

    def get_tool(self, name: str) -> Optional[ToolDefinition]:
        return self._tools.get(name)

    def list_tools(self) -> List[ToolDefinition]:
        return list(self._tools.values())

    def to_openai_tools(self) -> List[Dict[str, Any]]:
        return [tool.to_openai_function() for tool in self._tools.values()]

    async def execute(self, name: str, arguments: Dict[str, Any], **extra_kwargs) -> Any:
        tool = self.get_tool(name)
        if tool is None:
            raise ValueError(f"Unknown tool: {name}")

        result = tool.func(**arguments, **extra_kwargs)

        if inspect.isawaitable(result):
            result = await result

        return result


registry = PluginRegistry()
agent_tool = registry.register
