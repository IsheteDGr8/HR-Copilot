import os
from typing import Optional, List, Dict

from azure.cosmos.aio import CosmosClient

MOCK_EMPLOYEES = [
    {
        "id": "E1001", "name": "Sarah Chen", "role": "Senior Product Manager",
        "department": "Product", "email": "sarah.chen@example.com",
        "manager": "Priya Nair", "location": "Seattle, WA",
        "salary": "$165,000", "pto_remaining": 18, "pto_used": 7,
        "hire_date": "2021-03-15"
    },
    {
        "id": "E1002", "name": "Marcus Johnson", "role": "Lead Software Engineer",
        "department": "Engineering", "email": "marcus.j@example.com",
        "manager": "David Kim", "location": "Austin, TX",
        "salary": "$175,000", "pto_remaining": 12, "pto_used": 13,
        "hire_date": "2019-11-01"
    },
    {
        "id": "E1003", "name": "Priya Nair", "role": "Director of Product",
        "department": "Product", "email": "priya.nair@example.com",
        "manager": "Elena Rostova", "location": "San Francisco, CA",
        "salary": "$210,000", "pto_remaining": 22, "pto_used": 3,
        "hire_date": "2018-06-20"
    },
    {
        "id": "E1004", "name": "David Kim", "role": "VP of Engineering",
        "department": "Engineering", "email": "david.kim@example.com",
        "manager": "Elena Rostova", "location": "San Francisco, CA",
        "salary": "$240,000", "pto_remaining": 15, "pto_used": 10,
        "hire_date": "2017-02-10"
    },
    {
        "id": "E1005", "name": "Elena Rostova", "role": "Chief Executive Officer",
        "department": "Executive", "email": "elena.r@example.com",
        "manager": "Board of Directors", "location": "San Francisco, CA",
        "salary": "$450,000", "pto_remaining": 25, "pto_used": 0,
        "hire_date": "2015-01-01"
    },
    {
        "id": "E1006", "name": "James Wilson", "role": "HR Generalist",
        "department": "Human Resources", "email": "james.w@example.com",
        "manager": "Amanda Vance", "location": "Chicago, IL",
        "salary": "$85,000", "pto_remaining": 20, "pto_used": 5,
        "hire_date": "2022-08-14"
    },
    {
        "id": "E1007", "name": "Amanda Vance", "role": "VP of Human Resources",
        "department": "Human Resources", "email": "amanda.v@example.com",
        "manager": "Elena Rostova", "location": "New York, NY",
        "salary": "$205,000", "pto_remaining": 14, "pto_used": 11,
        "hire_date": "2018-10-05"
    },
    {
        "id": "E1008", "name": "Liam Gallagher", "role": "Data Scientist",
        "department": "Data", "email": "liam.g@example.com",
        "manager": "Sophia Lin", "location": "London, UK",
        "salary": "$140,000", "pto_remaining": 20, "pto_used": 10,
        "hire_date": "2021-05-23"
    },
    {
        "id": "E1009", "name": "Sophia Lin", "role": "Head of Data",
        "department": "Data", "email": "sophia.l@example.com",
        "manager": "Elena Rostova", "location": "San Francisco, CA",
        "salary": "$215,000", "pto_remaining": 18, "pto_used": 7,
        "hire_date": "2019-03-12"
    },
    {
        "id": "E1010", "name": "Noah Patel", "role": "Frontend Developer",
        "department": "Engineering", "email": "noah.p@example.com",
        "manager": "Marcus Johnson", "location": "Austin, TX",
        "salary": "$115,000", "pto_remaining": 19, "pto_used": 6,
        "hire_date": "2023-01-10"
    },
    {
        "id": "E1011", "name": "Olivia Smith", "role": "Backend Developer",
        "department": "Engineering", "email": "olivia.s@example.com",
        "manager": "Marcus Johnson", "location": "Remote",
        "salary": "$125,000", "pto_remaining": 15, "pto_used": 10,
        "hire_date": "2022-11-20"
    },
    {
        "id": "E1012", "name": "Ethan Hunt", "role": "Security Analyst",
        "department": "IT", "email": "ethan.h@example.com",
        "manager": "David Kim", "location": "Washington D.C.",
        "salary": "$135,000", "pto_remaining": 22, "pto_used": 3,
        "hire_date": "2020-07-04"
    },
    {
        "id": "E1013", "name": "Isabella Rossi", "role": "Marketing Specialist",
        "department": "Marketing", "email": "isabella.r@example.com",
        "manager": "Michael Chang", "location": "Milan, Italy",
        "salary": "$90,000", "pto_remaining": 24, "pto_used": 1,
        "hire_date": "2023-09-01"
    },
    {
        "id": "E1014", "name": "Michael Chang", "role": "CMO",
        "department": "Marketing", "email": "michael.c@example.com",
        "manager": "Elena Rostova", "location": "New York, NY",
        "salary": "$230,000", "pto_remaining": 10, "pto_used": 15,
        "hire_date": "2017-09-15"
    },
    {
        "id": "E1015", "name": "Aisha Jones", "role": "Sales Representative",
        "department": "Sales", "email": "aisha.j@example.com",
        "manager": "Robert Taylor", "location": "Atlanta, GA",
        "salary": "$85,000", "pto_remaining": 16, "pto_used": 9,
        "hire_date": "2022-04-18"
    }
]


class DatabaseService:
    def __init__(self):
        self.use_mock = os.getenv("USE_MOCK_AZURE", "true").lower() == "true"
        self.cosmos_endpoint = os.getenv("COSMOS_ENDPOINT")
        self.cosmos_key = os.getenv("COSMOS_KEY")
        self.database_name = os.getenv("COSMOS_DATABASE_NAME")
        self.container_name = os.getenv("COSMOS_EMPLOYEES_CONTAINER")

        self._client: Optional[CosmosClient] = None
        self._container = None

        self.use_real_db = bool(
            not self.use_mock
            and self.cosmos_endpoint
            and self.cosmos_key
            and self.database_name
            and self.container_name
        )

    async def _get_container(self):
        if self._container is not None:
            return self._container

        self._client = CosmosClient(
            url=self.cosmos_endpoint,
            credential=self.cosmos_key,
        )
        database = self._client.get_database_client(self.database_name)
        self._container = database.get_container_client(self.container_name)
        return self._container

    async def close(self):
        if self._client is not None:
            await self._client.close()

    async def get_user_profile(self, user_id: str) -> dict:
        if not self.use_real_db:
            return next((emp for emp in MOCK_EMPLOYEES if emp["id"] == user_id), {})

        container = await self._get_container()

        query = "SELECT * FROM c WHERE c.employeeId = @employeeId"
        parameters = [{"name": "@employeeId", "value": user_id}]

        results = []
        async for item in container.query_items(
            query=query,
            parameters=parameters,
            partition_key=user_id,
        ):
            results.append(item)

        return results[0] if results else {}

    async def lookup_employee_by_name(self, name: str) -> Optional[Dict]:
        if not self.use_real_db:
            name_lower = name.lower()
            for emp in MOCK_EMPLOYEES:
                if name_lower in emp["name"].lower():
                    return emp
            return None

        container = await self._get_container()

        query = "SELECT * FROM c WHERE CONTAINS(LOWER(c.name), @name)"
        parameters = [{"name": "@name", "value": name.lower()}]

        async for item in container.query_items(
            query=query,
            parameters=parameters,
        ):
            return item

        return None


db_service = DatabaseService()