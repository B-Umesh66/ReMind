"""Centralised, bounded Ollama integration. No cloud fallback is ever used."""
import asyncio, os
from typing import Any
import httpx

class AIUnavailable(RuntimeError): pass
class InvalidAIResponse(RuntimeError): pass

class OllamaProvider:
    def __init__(self):
        self.base=os.getenv('OLLAMA_BASE_URL','http://localhost:11434').rstrip('/')
        self.llm=os.getenv('OLLAMA_LLM_MODEL','qwen3:4b')
        self.embedding=os.getenv('OLLAMA_EMBEDDING_MODEL','qwen3-embedding:0.6b')
        self.timeout=float(os.getenv('OLLAMA_TIMEOUT_SECONDS','180'))
        self.limit=asyncio.Semaphore(int(os.getenv('AI_CONCURRENCY_LIMIT','1')))
    async def tags(self)->list[str]:
        try:
            async with httpx.AsyncClient(timeout=4) as c: r=await c.get(self.base+'/api/tags'); r.raise_for_status()
            return [x.get('name','') for x in r.json().get('models',[])]
        except httpx.HTTPError as e: raise AIUnavailable('Ollama is unavailable. Start Ollama and pull the configured models.') from e
    async def embed(self, text:str)->list[float]:
        async with self.limit:
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as c:
                    r=await c.post(self.base+'/api/embed',json={'model':self.embedding,'input':text});r.raise_for_status(); body=r.json()
                values=body.get('embeddings');
                if not isinstance(values,list) or not values or not isinstance(values[0],list): raise InvalidAIResponse('Embedding model returned no embeddings.')
                return values[0]
            except httpx.HTTPError as e: raise AIUnavailable('Embedding request failed. Verify Ollama and the embedding model.') from e
    async def generate(self, prompt:str)->str:
        async with self.limit:
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as c:
                    r=await c.post(self.base+'/api/generate',json={'model':self.llm,'prompt':prompt,'stream':False,'options':{'temperature':0.2}});r.raise_for_status(); body=r.json()
                answer=body.get('response')
                if not isinstance(answer,str) or not answer.strip(): raise InvalidAIResponse('Language model returned an empty response.')
                return answer.strip()
            except httpx.HTTPError as e: raise AIUnavailable('Generation request failed. Verify Ollama and the configured language model.') from e

provider=OllamaProvider()
