"""Centralised, bounded Ollama integration. No cloud fallback is ever used."""
import asyncio, json, os, re
from typing import Any, TypeVar
import httpx
from pydantic import BaseModel, ValidationError

class AIUnavailable(RuntimeError): pass
class InvalidAIResponse(RuntimeError): pass
T = TypeVar('T', bound=BaseModel)

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
                    # Free the embedding model before a subsequent Qwen generation.
                    # This is important on the target 4 GB VRAM laptop.
                    r=await c.post(self.base+'/api/embed',json={'model':self.embedding,'input':text,'keep_alive':0})
                    if not r.is_success: raise AIUnavailable(f'Embedding request failed ({r.status_code}): {r.text[:240]}')
                    body=r.json()
                values=body.get('embeddings');
                if not isinstance(values,list) or not values or not isinstance(values[0],list): raise InvalidAIResponse('Embedding model returned no embeddings.')
                return values[0]
            except httpx.HTTPError as e: raise AIUnavailable('Embedding request failed. Verify Ollama and the embedding model.') from e
    async def generate(self, prompt:str, output_format:dict[str,Any]|str|None=None)->str:
        async with self.limit:
            try:
                num_predict = int(os.getenv('OLLAMA_NUM_PREDICT', '1500'))
                num_ctx = int(os.getenv('OLLAMA_NUM_CTX', '4096'))
                async with httpx.AsyncClient(timeout=self.timeout) as c:
                    payload={'model':self.llm,'prompt':prompt,'stream':False,'think':False,'keep_alive':0,'options':{'temperature':0.1,'num_ctx':num_ctx,'num_predict':num_predict}}
                    if output_format is not None: payload['format']=output_format
                    r=await c.post(self.base+'/api/generate',json=payload)
                    if not r.is_success: raise AIUnavailable(f'Generation request failed ({r.status_code}): {r.text[:240]}')
                    body=r.json()
                answer=body.get('response')
                if not isinstance(answer,str) or not answer.strip(): raise InvalidAIResponse('Language model returned an empty response.')
                return answer.strip()
            except httpx.HTTPError as e: raise AIUnavailable('Generation request failed. Verify Ollama and the configured language model.') from e
    async def structured(self, prompt:str, schema:type[T])->T:
        """Ask Qwen for compact JSON and validate it before application code sees it."""
        text=await self.generate(prompt + '\n\nReturn the JSON object required by the schema.', schema.model_json_schema())
        # Strip thinking preamble if present
        candidate=re.sub(r'<think>.*?</think>', '', text, flags=re.S).strip()
        # Strip markdown fences if present
        if '```json' in candidate:
            candidate = candidate.split('```json', 1)[1].split('```', 1)[0].strip()
        elif '```' in candidate:
            candidate = candidate.split('```', 1)[1].split('```', 1)[0].strip()
        first=candidate.find('{'); last=candidate.rfind('}')
        if first < 0 or last <= first: raise InvalidAIResponse('Model did not return a JSON object.')
        json_str = candidate[first:last+1]
        try:
            return schema.model_validate(json.loads(json_str))
        except (json.JSONDecodeError, ValidationError) as e:
            # Clean common trailing commas before closing braces/brackets and retry
            cleaned_json = re.sub(r',\s*([\]}])', r'\1', json_str)
            try:
                return schema.model_validate(json.loads(cleaned_json))
            except Exception:
                raise InvalidAIResponse(f'Model returned invalid structured output: {e}') from e

provider=OllamaProvider()
