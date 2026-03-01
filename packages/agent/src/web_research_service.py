#!/usr/bin/env python3
"""
Web Research Service for CodIn
Enables web search, research, and information gathering capabilities
"""

import os
import sys
import json
import requests
from typing import Dict, List, Optional, Any
from datetime import datetime
import hashlib

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class WebResearchService:
    """Service for web research and information gathering"""

    def __init__(self):
        """Initialize the web research service"""
        self.cache = {}
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'CodIn/1.0 (+https://github.com/codin)'
        })
        self.max_retries = 3
        self.timeout = 10

    def search_web(self, query: str, num_results: int = 5) -> List[Dict[str, Any]]:
        """
        Search the web for information
        
        Args:
            query: Search query string
            num_results: Number of results to return
            
        Returns:
            List of search results with title, snippet, url
        """
        try:
            # Use DuckDuckGo as fallback (doesn't require API key)
            results = self._search_duckduckgo(query, num_results)
            return results
        except Exception as e:
            return {
                'error': str(e),
                'message': 'Web search failed. Make sure you have internet connection.',
                'results': []
            }

    def _search_duckduckgo(self, query: str, num_results: int = 5) -> List[Dict[str, Any]]:
        """Search using DuckDuckGo API"""
        url = "https://api.duckduckgo.com/"
        params = {
            'q': query,
            'format': 'json',
            'no_redirect': 1
        }

        response = self.session.get(url, params=params, timeout=self.timeout)
        response.raise_for_status()

        data = response.json()
        results = []

        # Extract results from AbstractText
        if data.get('Abstract'):
            results.append({
                'title': data.get('Heading', query),
                'snippet': data.get('Abstract', ''),
                'url': data.get('AbstractURL', ''),
                'source': 'DuckDuckGo',
                'type': 'abstract'
            })

        # Extract from related topics (RelatedTopics)
        for topic in data.get('RelatedTopics', [])[:num_results]:
            if 'Text' in topic and 'FirstURL' in topic:
                results.append({
                    'title': topic.get('Text', '')[:100],
                    'snippet': topic.get('Text', ''),
                    'url': topic.get('FirstURL', ''),
                    'source': 'DuckDuckGo',
                    'type': 'related'
                })

        return results[:num_results]

    def fetch_url(self, url: str, extract_text: bool = True) -> Dict[str, Any]:
        """
        Fetch content from a URL
        
        Args:
            url: URL to fetch
            extract_text: Whether to extract and clean text content
            
        Returns:
            Dictionary with url, title, content, and metadata
        """
        try:
            # Check cache first
            cache_key = hashlib.md5(url.encode()).hexdigest()
            if cache_key in self.cache:
                return self.cache[cache_key]

            response = self.session.get(url, timeout=self.timeout)
            response.raise_for_status()

            content = {
                'url': url,
                'status_code': response.status_code,
                'headers': dict(response.headers),
                'content_type': response.headers.get('content-type', ''),
                'timestamp': datetime.now().isoformat(),
                'length': len(response.text)
            }

            if extract_text and 'text/html' in response.headers.get('content-type', ''):
                # Try to extract title and main content
                try:
                    from bs4 import BeautifulSoup
                    soup = BeautifulSoup(response.text, 'html.parser')

                    # Extract title
                    title = soup.find('title')
                    content['title'] = title.get_text() if title else 'No title'

                    # Extract main text
                    for script in soup(['script', 'style', 'meta', 'link']):
                        script.decompose()

                    text = soup.get_text()
                    lines = [line.strip() for line in text.split('\n') if line.strip()]
                    content['text'] = '\n'.join(lines[:100])  # First 100 lines
                except ImportError:
                    content['text'] = response.text[:1000]  # Fallback to raw text
            else:
                content['raw'] = response.text[:1000]

            # Cache the result
            self.cache[cache_key] = content
            return content

        except Exception as e:
            return {
                'url': url,
                'error': str(e),
                'message': f'Failed to fetch URL: {str(e)}'
            }

    def research_topic(self, topic: str, depth: str = 'basic') -> Dict[str, Any]:
        """
        Perform research on a topic
        
        Args:
            topic: Topic to research
            depth: 'basic', 'detailed', or 'comprehensive'
            
        Returns:
            Comprehensive research results
        """
        results = {
            'topic': topic,
            'depth': depth,
            'timestamp': datetime.now().isoformat(),
            'sources': [],
            'summary': '',
            'key_points': []
        }

        try:
            # Perform web search
            search_results = self.search_web(topic, num_results=5 if depth == 'basic' else 10)

            if isinstance(search_results, dict) and 'error' in search_results:
                return search_results

            results['sources'] = search_results

            # Fetch detailed content if needed
            if depth in ['detailed', 'comprehensive']:
                for i, source in enumerate(search_results[:3]):
                    if 'url' in source:
                        content = self.fetch_url(source['url'])
                        if 'text' in content:
                            results['key_points'].append({
                                'source': source.get('title', 'Unknown'),
                                'text': content['text'][:500]
                            })

            # Create summary
            snippets = [s.get('snippet', '') for s in search_results if 'snippet' in s]
            results['summary'] = ' '.join(snippets[:200])

            return results

        except Exception as e:
            return {
                'error': str(e),
                'message': f'Research failed: {str(e)}'
            }

    def code_documentation_search(self, library: str, topic: str) -> Dict[str, Any]:
        """
        Search for code documentation
        
        Args:
            library: Library name (e.g., 'react', 'nodejs', 'python')
            topic: Topic to search for
            
        Returns:
            Documentation search results
        """
        search_query = f"{library} {topic} documentation site:docs.* OR site:github.com"
        results = self.search_web(search_query, num_results=5)

        return {
            'query': search_query,
            'library': library,
            'topic': topic,
            'results': results,
            'timestamp': datetime.now().isoformat()
        }

    def code_example_search(self, language: str, pattern: str) -> Dict[str, Any]:
        """
        Search for code examples
        
        Args:
            language: Programming language
            pattern: Code pattern or problem
            
        Returns:
            Code example results
        """
        search_query = f"{language} {pattern} example site:github.com OR site:stackoverflow.com"
        results = self.search_web(search_query, num_results=5)

        return {
            'query': search_query,
            'language': language,
            'pattern': pattern,
            'results': results,
            'timestamp': datetime.now().isoformat()
        }

    def bug_solution_search(self, error_message: str, language: str = '') -> Dict[str, Any]:
        """
        Search for solutions to a bug or error
        
        Args:
            error_message: Error message or bug description
            language: Programming language if known
            
        Returns:
            Solution search results
        """
        search_query = f"{language} {error_message} solution"
        results = self.search_web(search_query, num_results=5)

        return {
            'error': error_message,
            'language': language,
            'results': results,
            'timestamp': datetime.now().isoformat()
        }

    def clear_cache(self):
        """Clear the results cache"""
        self.cache.clear()
        return {'message': 'Cache cleared', 'size': 0}

    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        return {
            'cache_size': len(self.cache),
            'memory_usage': sum(len(str(v)) for v in self.cache.values()),
            'timestamp': datetime.now().isoformat()
        }


# Global instance
research_service = WebResearchService()


def handle_research_request(request_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle research request from the main agent
    
    Args:
        request_data: Request dictionary with 'action' and parameters
        
    Returns:
        Result dictionary
    """
    action = request_data.get('action', '')
    
    if action == 'web_search':
        return {
            'success': True,
            'data': research_service.search_web(
                request_data.get('query', ''),
                request_data.get('num_results', 5)
            )
        }
    
    elif action == 'fetch_url':
        return {
            'success': True,
            'data': research_service.fetch_url(request_data.get('url', ''))
        }
    
    elif action == 'research_topic':
        return {
            'success': True,
            'data': research_service.research_topic(
                request_data.get('topic', ''),
                request_data.get('depth', 'basic')
            )
        }
    
    elif action == 'code_documentation_search':
        return {
            'success': True,
            'data': research_service.code_documentation_search(
                request_data.get('library', ''),
                request_data.get('topic', '')
            )
        }
    
    elif action == 'code_example_search':
        return {
            'success': True,
            'data': research_service.code_example_search(
                request_data.get('language', ''),
                request_data.get('pattern', '')
            )
        }
    
    elif action == 'bug_solution_search':
        return {
            'success': True,
            'data': research_service.bug_solution_search(
                request_data.get('error_message', ''),
                request_data.get('language', '')
            )
        }
    
    elif action == 'clear_cache':
        return {
            'success': True,
            'data': research_service.clear_cache()
        }
    
    elif action == 'cache_stats':
        return {
            'success': True,
            'data': research_service.get_cache_stats()
        }
    
    else:
        return {
            'success': False,
            'error': f'Unknown action: {action}',
            'available_actions': [
                'web_search',
                'fetch_url',
                'research_topic',
                'code_documentation_search',
                'code_example_search',
                'bug_solution_search',
                'clear_cache',
                'cache_stats'
            ]
        }


if __name__ == '__main__':
    # Test the service
    service = WebResearchService()

    print("🔍 CodIn Web Research Service")
    print("=" * 50)

    # Test web search
    print("\n1️⃣ Testing web search...")
    results = service.search_web("Python async await", 3)
    print(f"Found {len(results)} results")
    for r in results[:2]:
        print(f"  - {r.get('title', 'N/A')}")

    # Test code documentation search
    print("\n2️⃣ Testing code documentation search...")
    doc_results = service.code_documentation_search("react", "hooks")
    print(f"Found {len(doc_results.get('results', []))} documentation results")

    # Test bug solution search
    print("\n3️⃣ Testing bug solution search...")
    bug_results = service.bug_solution_search("TypeError: Cannot read property 'map'", "javascript")
    print(f"Found {len(bug_results.get('results', []))} bug solutions")

    # Cache stats
    print("\n4️⃣ Cache statistics:")
    stats = service.get_cache_stats()
    print(f"  - Cache size: {stats['cache_size']}")
    print(f"  - Memory usage: {stats['memory_usage']} bytes")

    print("\n✅ Web Research Service is ready!")
