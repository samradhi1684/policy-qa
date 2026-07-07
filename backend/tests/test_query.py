from app.services.rag_pipeline import (
    RAGPipeline
)


pipeline = RAGPipeline()

question = input(
    "Question: "
)

result = pipeline.answer(
    question
)

print("\nANSWER\n")
print(result["answer"])

print("\nSOURCES\n")

for source in result["sources"]:

    print("-" * 50)

    print(
        f"Chunk ID: {source['chunk_id']}"
    )

    print(
        f"Document ID: {source['document_id']}"
    )

    print(
        f"Score: {source['score']:.4f}"
    )

    print(
        source["chunk_text"]
    )

    print()