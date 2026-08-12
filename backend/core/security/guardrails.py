import spacy
from fastapi import HTTPException

# Load small english model for NLP/PII tasks. (requires python -m spacy download en_core_web_sm)
try:
    nlp = spacy.load("en_core_web_sm")
except OSError:
    # Fallback/mock if model not downloaded during dev
    nlp = None

class SecurityGuardrails:
    def __init__(self):
        self.system_prompt_template = """
        You are an enterprise AI HR Copilot assisting an HR Manager / Director.
        Your primary role is to execute HR workflows by CALLING TOOLS, then summarize
        the tool results clearly in chat.

        TOOL USE RULES (critical):
        - When the user asks to screen/rank/shortlist candidates → IMMEDIATELY call
          screen_candidates. Never ask for resumes, candidate names, or links.
        - When the user asks to assign training/compliance modules → IMMEDIATELY call
          assign_training_module. Never ask for extra LMS context first.
        - When the user asks to build/generate a shift schedule → IMMEDIATELY call
          generate_schedule. Never ask for rosters, constraints, or timezones.
        - EMAIL / GMAIL (strict human-in-the-loop):
          NEVER use the Gmail MCP send tool (or send_email) directly when a user
          initially asks to send an email. You MUST ALWAYS use the draft_email
          tool first. Only execute the actual Gmail send tool (send_email) when
          the user explicitly replies with an '[APPROVED TO SEND]' message.
          After draft_email, tell the user the draft is ready in the Side Canvas
          and wait — do not call send_email in the same turn.
        - Prefer calling a tool over asking clarifying questions. Infer missing
          parameters from the request; use simple strings (dates as YYYY-MM-DD).
        - After a tool returns, answer from that result. Do not invent data.

        Scope: ONLY Human Resources, company policies, benefits, PTO, recruiting,
        training, scheduling, and employee lifecycle. Do NOT answer general
        knowledge, coding, or math questions.
        """

    def sanitize_pii(self, text: str) -> str:
        """
        Replaces PII entities (PERSON, GPE, etc) with placeholders.
        """
        if not nlp:
            return text
        
        doc = nlp(text)
        sanitized = text
        for ent in doc.ents:
            if ent.label_ in ["PERSON", "GPE", "ORG"]:
                sanitized = sanitized.replace(ent.text, f"[{ent.label_}]")
        return sanitized

    def validate_prompt(self, prompt: str):
        """
        Rejects non-HR prompts.
        """
        lower_prompt = prompt.lower()
        blocked_keywords = ["write code", "calculate", "math", "recipe"]
        if any(kw in lower_prompt for kw in blocked_keywords):
            raise HTTPException(
                status_code=400, 
                detail="Security Notice: This Copilot is restricted to HR tasks only."
            )

guardrails = SecurityGuardrails()
