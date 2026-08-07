import asyncio
import os
import sys

# Setup env vars for Cosmos DB connection
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), 'backend', '.env'), override=True)

from services.db import db_service

async def main():
    print("Looking up Joseph Johnson...")
    try:
        res = await db_service.lookup_employee("Joseph Johnson")
        print("Result:", res)
    except Exception as e:
        print("Exception:", e)

    await db_service.close()

if __name__ == "__main__":
    asyncio.run(main())
