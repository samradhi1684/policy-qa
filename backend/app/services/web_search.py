import os

from tavily import TavilyClient

client = TavilyClient(
    api_key=os.getenv(
        "TAVILY_API_KEY"
    )
)

def search_web(query: str):

    result = client.search(
        query=query,
        max_results=5,
    )

    return result["results"]