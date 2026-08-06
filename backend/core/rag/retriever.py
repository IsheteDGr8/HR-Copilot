import os

class HybridRetriever:
    def __init__(self):
        self.use_mock = os.getenv("USE_MOCK_AZURE", "true").lower() == "true"

    async def search(self, query: str) -> list[str]:
        if self.use_mock:
            return ["HR Policy: Standard PTO is 20 days per year."]
        else:
            # Azure AI Search integration would go here
            return []
