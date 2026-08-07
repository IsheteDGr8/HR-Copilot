import os
from typing import Optional, Dict
from azure.cosmos.aio import CosmosClient
from azure.cosmos.exceptions import CosmosResourceNotFoundError

class DatabaseService:
    def __init__(self):
        self.connection_string = os.getenv("COSMOS_CONNECTION_STRING")
        self.database_name = "closedai-db"
        self.container_name = "employees"
        self._client: Optional[CosmosClient] = None
        self._container = None

    async def _get_container(self):
        if self._container is not None:
            return self._container
            
        if not self.connection_string:
            raise ValueError("COSMOS_CONNECTION_STRING is not set.")

        self._client = CosmosClient.from_connection_string(self.connection_string)
        database = self._client.get_database_client(self.database_name)
        self._container = database.get_container_client(self.container_name)
        return self._container

    async def close(self):
        if self._client is not None:
            await self._client.close()

    async def lookup_employee(self, name: str) -> dict:
        container = await self._get_container()
        query = "SELECT * FROM c WHERE LOWER(c.name) = LOWER(@name)"
        parameters = [{"name": "@name", "value": name}]

        results = []
        async for item in container.query_items(
            query=query,
            parameters=parameters
        ):
            results.append(item)
            
        if not results:
            return {"error": f"Error: Employee '{name}' not found in database."}
        return results[0]

    async def get_employee_by_id(self, employee_id: str) -> dict:
        container = await self._get_container()
        query = "SELECT * FROM c WHERE c.id = @id"
        parameters = [{"name": "@id", "value": employee_id}]

        results = []
        async for item in container.query_items(
            query=query,
            parameters=parameters
        ):
            results.append(item)

        if not results:
            return {"error": f"Error: Employee with ID '{employee_id}' not found in database."}
        return results[0]
    
    async def get_pto_balance(self, employee_id: str) -> dict:
        container = await self._get_container()
        query = "SELECT c.pto_remaining, c.pto_used FROM c WHERE c.id = @id"
        parameters = [{"name": "@id", "value": employee_id}]

        results = []
        async for item in container.query_items(
            query=query,
            parameters=parameters
        ):
            results.append(item)
            
        if not results:
            return {"error": f"Error: Employee with ID '{employee_id}' not found in database."}
        return results[0]

    async def get_org_chart(self, employee_id: str) -> dict:
        container = await self._get_container()
        query = "SELECT c.manager, c.department FROM c WHERE c.id = @id"
        parameters = [{"name": "@id", "value": employee_id}]

        results = []
        async for item in container.query_items(
            query=query,
            parameters=parameters
        ):
            results.append(item)
            
        if not results:
            return {"error": f"Error: Employee with ID '{employee_id}' not found in database."}
        return results[0]


db_service = DatabaseService()