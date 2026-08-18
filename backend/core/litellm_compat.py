"""LiteLLM + Pydantic 2.13 compatibility.

LiteLLM's `Message` model types `reasoning_items` as
`list[ChatCompletionReasoningItem]`. That TypedDict forward-references
`ChatCompletionReasoningSummaryTextBlock`, which is never imported into
`litellm.types.utils`. Pydantic 2.13 then leaves `Message` as a mock
validator, and the first `completion()` / `acompletion()` call fails with:

    Message is not fully defined; you should define
    ChatCompletionReasoningSummaryTextBlock, then call Message.model_rebuild()
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

_patched = False


def ensure_litellm_models() -> None:
    """Inject the missing nested type and rebuild LiteLLM response models."""
    global _patched
    if _patched:
        return

    import litellm.types.utils as utils
    from litellm.types.llms.openai import ChatCompletionReasoningSummaryTextBlock

    if getattr(utils, "ChatCompletionReasoningSummaryTextBlock", None) is None:
        utils.ChatCompletionReasoningSummaryTextBlock = ChatCompletionReasoningSummaryTextBlock

    for name in ("Message", "Delta", "Choices", "StreamingChoices", "ModelResponse"):
        cls = getattr(utils, name, None)
        rebuild = getattr(cls, "model_rebuild", None)
        if not callable(rebuild):
            continue
        try:
            rebuild()
        except Exception as exc:
            logger.warning("LiteLLM %s.model_rebuild() failed: %s", name, exc)

    _patched = True


ensure_litellm_models()
