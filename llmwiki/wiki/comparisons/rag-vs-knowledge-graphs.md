---
title: RAG vs Knowledge Graphs
description: Comparing chunk-based vector retrieval and graph-based structured retrieval as grounding strategies for language models
date: 2026-07-12
tags: [rag, knowledge-graphs, retrieval, comparison]
---

[Retrieval-Augmented Generation](../concepts/retrieval-augmented-generation.md) and [Knowledge Graphs](../concepts/knowledge-graphs.md) are two ways to ground a language model's answers in external data. Both retrieve context before generation, but they retrieve fundamentally different units and support different reasoning patterns.

## Comparison

| Aspect | Vector RAG | Knowledge Graph |
|---|---|---|
| Unit of retrieval | Text chunks, ranked by embedding similarity[^1] | Entities and relations[^2] |
| Reasoning style | Single-hop semantic match | Multi-hop traversal across relation chains[^2] |
| Data preparation | Chunk documents, embed into vectors[^1] | Extract entities and relations, deduplicate, link mentions[^2] |
| Query-time step | Embed query, nearest-neighbor vector search[^1] | Graph traversal from query-relevant entities[^2] |
| Weak point | Cannot easily follow chains of relations[^2] | Requires accurate upfront entity/relation extraction[^2] |

## Where They Meet

Both approaches typically depend on a [Transformer](../entities/transformer-architecture.md)-based model: RAG uses one to embed text and generate the final answer, while knowledge graph construction uses one to extract entities and relations from source documents. The two techniques are complementary rather than exclusive — a system can use vector search to find a relevant subgraph, then traverse it for multi-hop facts.

## Related Pages

- [Retrieval-Augmented Generation](../concepts/retrieval-augmented-generation.md)
- [Knowledge Graphs](../concepts/knowledge-graphs.md)
- [Transformer Architecture](../entities/transformer-architecture.md)

[^1]: rag.pdf, p.1
[^2]: knowledge-graphs.pdf, p.1
