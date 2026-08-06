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
        Your primary role is to help the HR admin look up information on OTHER employees 
        across the organization (e.g., Sarah Chen, Marcus Johnson), trigger appropriate tools, 
        and provide a clear textual response in the chat.
        You must ONLY answer questions related to Human Resources, Company Policies, 
        Benefits, PTO, and Employee lifecycle.
        Do NOT answer general knowledge, coding, or math questions.
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
