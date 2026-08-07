class CommunicationsService:
    def __init__(self):
        pass

    async def send_email(self, to: str, subject: str, body: str) -> bool:
        """
        Mock service for sending emails. 
        In production, this would integrate with Microsoft Graph API.
        """
        print(f"--- MOCK EMAIL SENT ---")
        print(f"To: {to}")
        print(f"Subject: {subject}")
        print(f"Body:\n{body}")
        print(f"-----------------------")
        return True

communications_service = CommunicationsService()
