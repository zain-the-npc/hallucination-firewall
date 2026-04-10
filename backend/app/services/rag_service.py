## rag_service.py
import os
import re
import asyncio
import requests
import httpx
from typing import Optional
from langchain_community.document_loaders import WikipediaLoader
from app.services.gpt_service import get_grounded_response

# ── Serper API config ──────────────────────────────────────────────────────────
SERPER_API_KEY = os.getenv("SERPER_API_KEY")
SERPER_URL     = "https://google.serper.dev/search"


def _emit(status_cb, msg: str):
    print(f"[RAG STATUS] {msg}")
    if status_cb:
        status_cb(msg)


# ─────────────────────────────────────────────────────────────────────────────
# SERPER — Google Search
# ─────────────────────────────────────────────────────────────────────────────

async def search_serper_async(question: str, status_cb=None) -> Optional[dict]:
    try:
        if not SERPER_API_KEY:
            print("RAG: SERPER_API_KEY not set, skipping Google search")
            return None

        _emit(status_cb, "🌐 Searching Google via Serper...")

        headers = {
            "X-API-KEY":    SERPER_API_KEY,
            "Content-Type": "application/json"
        }
        payload = {"q": question, "num": 5}

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(SERPER_URL, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()

        organic = data.get("organic", [])
        if not organic:
            return None

        context_parts = []
        sources       = []
        for item in organic[:5]:
            title   = item.get("title", "")
            url     = item.get("link", "")
            snippet = item.get("snippet", "")
            if snippet:
                context_parts.append(f"{title}: {snippet}")
                sources.append({
                    "name":    title or url.split("/")[2].replace("www.", ""),
                    "url":     url,
                    "snippet": snippet[:250] + "..."
                })

        kg = data.get("knowledgeGraph", {})
        if kg.get("description"):
            context_parts.insert(0, f"Knowledge Graph: {kg['description']}")

        if not context_parts:
            return None

        context = "\n\n".join(context_parts)
        _emit(status_cb, f"✅ Google returned {len(sources)} results")
        print(f"RAG: Serper found {len(sources)} results")

        return {
            "context":  context[:4000],
            "sources":  sources,
            "provider": "Google (Serper)"
        }

    except Exception as e:
        print(f"Serper search failed: {e}")
        return None


def search_serper(question: str, status_cb=None) -> Optional[dict]:
    try:
        try:
            loop = asyncio.get_running_loop()
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(asyncio.run, search_serper_async(question, status_cb))
                return future.result()
        except RuntimeError:
            return asyncio.run(search_serper_async(question, status_cb))
    except Exception as e:
        print(f"Serper sync wrapper failed: {e}")
        return None


# ─────────────────────────────────────────────────────────────────────────────
# WIKIPEDIA — REST API (fast)
# ─────────────────────────────────────────────────────────────────────────────

async def search_wikipedia_rest_async(question: str, status_cb=None) -> Optional[dict]:
    try:
        _emit(status_cb, "📖 Searching Wikipedia...")

        term = question.replace("?", "").strip()
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"https://en.wikipedia.org/api/rest_v1/page/summary/{term.replace(' ', '_')}"
            )
            if response.status_code != 200:
                return None

        data    = response.json()
        extract = data.get("extract", "")
        title   = data.get("title", "")
        url     = data.get("content_urls", {}).get("desktop", {}).get("page", "")

        if not extract or len(extract) < 50:
            return None

        _emit(status_cb, f"✅ Wikipedia found: {title}")
        print(f"RAG: Wikipedia REST found '{title}'")
        return {
            "context":  extract,
            "sources": [{
                "name":    f"Wikipedia — {title}",
                "url":     url,
                "snippet": extract[:250] + "..."
            }],
            "provider": "Wikipedia"
        }
    except Exception as e:
        print(f"Wikipedia REST async failed: {e}")
        return None


def search_wikipedia_rest(question: str, status_cb=None) -> Optional[dict]:
    """Sync Wikipedia REST — kept for knowledge panel compatibility."""
    try:
        term     = question.replace("?", "").strip()
        response = requests.get(
            f"https://en.wikipedia.org/api/rest_v1/page/summary/{term.replace(' ', '_')}",
            timeout=10
        )
        if response.status_code != 200:
            return None

        data    = response.json()
        extract = data.get("extract", "")
        title   = data.get("title", "")
        url     = data.get("content_urls", {}).get("desktop", {}).get("page", "")

        if not extract or len(extract) < 50:
            return None

        print(f"RAG: Wikipedia REST found '{title}'")
        return {
            "context":  extract,
            "sources": [{
                "name":    f"Wikipedia — {title}",
                "url":     url,
                "snippet": extract[:250] + "..."
            }],
            "provider": "Wikipedia"
        }
    except Exception as e:
        print(f"Wikipedia REST failed: {e}")
        return None


# ─────────────────────────────────────────────────────────────────────────────
# WIKIPEDIA — LangChain loader (deeper, slower)
# ─────────────────────────────────────────────────────────────────────────────

async def search_wikipedia_langchain_async(question: str, status_cb=None) -> Optional[dict]:
    try:
        _emit(status_cb, "📚 Loading Wikipedia articles...")
        loop   = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None, lambda: _search_wikipedia_langchain_sync(question)
        )
        if result:
            _emit(status_cb, f"✅ Wikipedia LangChain: {len(result['sources'])} articles")
        return result
    except Exception as e:
        print(f"Wikipedia LangChain async failed: {e}")
        return None


def _search_wikipedia_langchain_sync(question: str) -> Optional[dict]:
    try:
        docs = WikipediaLoader(query=question, load_max_docs=2).load()
        if not docs:
            return None

        context = "\n\n".join([d.page_content[:2000] for d in docs])
        sources = []
        for d in docs:
            title = d.metadata.get("title", "Wikipedia")
            url   = d.metadata.get("source",
                    f"https://en.wikipedia.org/wiki/{title.replace(' ', '_')}")
            sources.append({
                "name":    f"Wikipedia — {title}",
                "url":     url,
                "snippet": d.page_content[:250] + "..."
            })

        print(f"RAG: Wikipedia LangChain found {len(docs)} docs")
        return {
            "context":  context,
            "sources":  sources,
            "provider": "Wikipedia"
        }
    except Exception as e:
        print(f"Wikipedia LangChain sync failed: {e}")
        return None


# ─────────────────────────────────────────────────────────────────────────────
# NEWSAPI
# ─────────────────────────────────────────────────────────────────────────────

async def search_newsapi_async(question: str, status_cb=None) -> Optional[dict]:
    try:
        NEWS_API_KEY = os.getenv("NEWS_API_KEY")
        if not NEWS_API_KEY:
            return None

        _emit(status_cb, "📰 Searching NewsAPI...")

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                "https://newsapi.org/v2/everything",
                params={
                    "q":        question,
                    "apiKey":   NEWS_API_KEY,
                    "pageSize": 3,
                    "language": "en",
                    "sortBy":   "relevancy"
                }
            )
            data = response.json()

        articles = data.get("articles", [])
        if not articles:
            return None

        context = "\n\n".join([
            f"{a['title']}: {a.get('description', '')}"
            for a in articles
        ])
        sources = [{
            "name":    a.get("source", {}).get("name", "News"),
            "url":     a.get("url", ""),
            "snippet": (a.get("description") or "")[:250] + "..."
        } for a in articles[:3]]

        _emit(status_cb, f"✅ NewsAPI: {len(articles)} articles")
        print(f"RAG: NewsAPI found {len(articles)} articles")
        return {
            "context":  context,
            "sources":  sources,
            "provider": "NewsAPI"
        }
    except Exception as e:
        print(f"NewsAPI async failed: {e}")
        return None


# ─────────────────────────────────────────────────────────────────────────────
# PARALLEL SEARCH — Serper + Wikipedia + NewsAPI simultaneously
# ─────────────────────────────────────────────────────────────────────────────

async def search_all_parallel(question: str, status_cb=None) -> Optional[dict]:
    _emit(status_cb, "🚀 Launching parallel searches: Google + Wikipedia + News...")

    tasks = [
        search_serper_async(question, status_cb),
        search_wikipedia_rest_async(question, status_cb),
        search_newsapi_async(question, status_cb),
    ]

    results = await asyncio.gather(*tasks, return_exceptions=True)

    serper_result = results[0] if not isinstance(results[0], Exception) else None
    wiki_result   = results[1] if not isinstance(results[1], Exception) else None
    news_result   = results[2] if not isinstance(results[2], Exception) else None

    merged_context = []
    merged_sources = []
    providers      = []

    # 1. Google
    if serper_result and serper_result.get("sources"):
        s = serper_result["sources"][0]
        merged_sources.append({"provider": "Google", "name": s["name"], "url": s["url"], "found": True})
        merged_context.append(serper_result["context"])
        providers.append("Google")
    else:
        merged_sources.append({"provider": "Google", "name": "No results found", "url": "", "found": False})

    # 2. Wikipedia
    if wiki_result and wiki_result.get("sources"):
        s = wiki_result["sources"][0]
        name = s["name"].replace("Wikipedia — ", "")
        merged_sources.append({"provider": "Wikipedia", "name": name, "url": s["url"], "found": True})
        merged_context.append(wiki_result["context"])
        providers.append("Wikipedia")
    else:
        merged_sources.append({"provider": "Wikipedia", "name": "No results found", "url": "", "found": False})

    # 3. NewsAPI
    if news_result and news_result.get("sources"):
        s = news_result["sources"][0]
        merged_sources.append({"provider": "NewsAPI", "name": s["name"], "url": s["url"], "found": True})
        merged_context.append(news_result["context"])
        providers.append("NewsAPI")
    else:
        merged_sources.append({"provider": "NewsAPI", "name": "No results found", "url": "", "found": False})

    provider_str = " + ".join(providers) if providers else "None"
    _emit(status_cb, f"✅ Got data from: {provider_str}")

    return {
        "context":  "\n\n---\n\n".join(merged_context)[:5000] if merged_context else "",
        "sources":  merged_sources,
        "provider": provider_str
    }


def search_all_parallel_sync(question: str, status_cb=None) -> Optional[dict]:
    try:
        try:
            asyncio.get_running_loop()
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(asyncio.run, search_all_parallel(question, status_cb))
                return future.result(timeout=25)
        except RuntimeError:
            return asyncio.run(search_all_parallel(question, status_cb))
    except Exception as e:
        print(f"Parallel search sync wrapper failed: {e}")
        return None


# ─────────────────────────────────────────────────────────────────────────────
# MAIN ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────

def get_corrected_answer(question: str, status_cb=None) -> dict:
    print(f"RAG: starting retrieval for '{question}'")
    _emit(status_cb, "🔍 Starting fact retrieval for your question...")

    retrieval = search_all_parallel_sync(question, status_cb)

    if not retrieval:
        retrieval = {
            "context": "",
            "sources": [
                {"provider": "Google", "name": "No results found", "url": "", "found": False},
                {"provider": "Wikipedia", "name": "No results found", "url": "", "found": False},
                {"provider": "NewsAPI", "name": "No results found", "url": "", "found": False}
            ],
            "provider": "None"
        }

    context  = retrieval["context"]
    sources  = retrieval["sources"]
    provider = retrieval["provider"]

    if context:
        _emit(status_cb, f"🤖 Grounding answer using {provider}...")
        print(f"RAG: grounding answer using {provider}")
        corrected = get_grounded_response(question, context)
        _emit(status_cb, "✅ Corrected answer ready!")
    else:
        corrected = None
        _emit(status_cb, "❌ All sources returned no results")

    return {
        "corrected_answer": corrected,
        "sources":          sources,
        "rag_used":         bool(context),
        "provider":         provider
    }