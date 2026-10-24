"""Bounded local/cloud AI providers with privacy-aware routing."""
import asyncio, json, logging, os, re, time
from pathlib import Path
from typing import Any, TypeVar

import httpx
from dotenv import load_dotenv
from pydantic import BaseModel, ValidationError

load_dotenv(Path(__file__).resolve().parents[1] / '.env', override=False)

class AIUnavailable(RuntimeError): pass
class AIConfigurationError(AIUnavailable): pass
class AICloudError(AIUnavailable):
    def __init__(self, message: str, *, retryable: bool = False):
        super().__init__(message)
        self.retryable = retryable
class InvalidAIResponse(RuntimeError): pass

logger = logging.getLogger(__name__)
T = TypeVar('T', bound=BaseModel)
OLLAMA_MODEL_OPTIONS = ('qwen3:4b', 'qwen2.5:3b')
OLLAMA_CHAT_MODEL_OPTIONS = ('qwen2.5:3b', 'qwen3:4b')
OLLAMA_CHAT_DEFAULT_MODEL = 'qwen2.5:3b'

def parse_structured(text: str, schema: type[T]) -> T:
    candidate=re.sub(r'<think>.*?</think>', '', text, flags=re.S).strip()
    if '```json' in candidate:
        candidate=candidate.split('```json', 1)[1].split('```', 1)[0].strip()
    elif '```' in candidate:
        candidate=candidate.split('```', 1)[1].split('```', 1)[0].strip()
    first=candidate.find('{')
    if first < 0: raise InvalidAIResponse('Model did not return a JSON object.')
    try:
        parsed, _=json.JSONDecoder().raw_decode(candidate[first:])
    except json.JSONDecodeError:
        last=candidate.rfind('}')
        if last <= first: raise InvalidAIResponse('Model did not return a complete JSON object.')
        try: parsed=json.loads(candidate[first:last+1])
        except json.JSONDecodeError as e: raise InvalidAIResponse('Model returned invalid structured output.') from e
    try:
        return schema.model_validate(parsed)
    except ValidationError as e:
        cleaned=re.sub(r',\s*([\]}])', r'\1', candidate[first:])
        try: return schema.model_validate(json.loads(cleaned))
        except Exception as clean_error: raise InvalidAIResponse(f'Model returned invalid structured output: {e}') from clean_error

def clean_ollama_response(text: str) -> str:
    """Remove confirmed Ollama reasoning wrappers without altering answer Markdown."""
    cleaned = text.strip()
    paired = re.sub(r'<think>\s*.*?\s*</think>\s*', '', cleaned, count=1, flags=re.IGNORECASE | re.DOTALL)
    if paired != cleaned:
        cleaned = paired.strip()
    else:
        closing_marker = re.search(r'</think>', cleaned, flags=re.IGNORECASE)
        if closing_marker:
            answer_after_reasoning = cleaned[closing_marker.end():].strip()
            cleaned = answer_after_reasoning or cleaned[:closing_marker.start()].rstrip()
    final_labels = list(re.finditer(
        r'(?im)^(?:final\s+(?:answer|response)|so,\s*the\s+answer\s+is|therefore,\s*the\s+answer\s+is)\s*:\s*',
        cleaned,
    ))
    if final_labels and re.search(
        r'(?i)\b(?:let me|i think|but note|however|alternatively|draft|final response|final answer)\b',
        cleaned[:final_labels[-1].start()],
    ):
        cleaned = cleaned[final_labels[-1].end():].strip()
    answer_labels = list(re.finditer(r'(?im)^(?:definition of [^:\n]{1,120}|answer)\s*:\s*', cleaned))
    if answer_labels and re.search(
        r'(?i)\b(?:we are given|we are to|we must|let me|the response must|i need to)\b',
        cleaned[:answer_labels[-1].start()],
    ):
        cleaned = cleaned[answer_labels[-1].end():].strip()
    trailing_meta = re.search(
        r'(?im)^(?:we must|we are to|the response must|let(?: me)?(?: write| try)|no extra text)\b.*',
        cleaned,
    )
    if trailing_meta and trailing_meta.start() > 0:
        cleaned = cleaned[:trailing_meta.start()].rstrip()
    cleaned = re.sub(r'^(?:final\s+(?:answer|response)\s*:)\s*', '', cleaned, count=1, flags=re.IGNORECASE)
    return cleaned

def extract_ollama_response(body: dict[str, Any]) -> str:
    message = body.get('message')
    if isinstance(message, dict) and isinstance(message.get('content'), str):
        return message['content']
    response = body.get('response')
    return response if isinstance(response, str) else ''

def remove_duplicate_paragraphs(text: str) -> str:
    paragraphs = [part.strip() for part in re.split(r'\n\s*\n', text) if part.strip()]
    unique: list[str] = []
    for paragraph in paragraphs:
        if paragraph not in unique:
            unique.append(paragraph)
    return '\n\n'.join(unique)

def clean_ollama_answer(text: str) -> str:
    cleaned = remove_duplicate_paragraphs(clean_ollama_response(text))
    if not cleaned:
        raise InvalidAIResponse('Language model returned an empty response.')
    return cleaned

def response_needs_repair(text: str) -> bool:
    meta = r'(?i)\b(?:we are given|we are to|we must|let me|i need to|i should|but note|however|alternatively|draft|self-evaluation|chain.of.thought)\b'
    return bool(re.search(meta, text)) and (text.count('\n\n') >= 2 or text.lower().count('final response') > 1)

def ollama_supports_thinking_control(model_info: dict[str, Any]) -> bool:
    """Recognize Ollama's current thinking metadata and older capability metadata."""
    capabilities = model_info.get('capabilities')
    if isinstance(capabilities, list) and 'thinking' in capabilities:
        return True
    thinking = model_info.get('thinking')
    if isinstance(thinking, bool):
        return thinking
    if isinstance(thinking, dict):
        values = thinking.get('values')
        return (isinstance(values, list) and True in values) or thinking.get('default') is True
    return False

class OllamaProvider:
    def __init__(self):
        self.base=os.getenv('OLLAMA_BASE_URL','http://localhost:11434').rstrip('/')
        self.llm=os.getenv('OLLAMA_LLM_MODEL','qwen3:4b')
        self.embedding=os.getenv('OLLAMA_EMBEDDING_MODEL','qwen3-embedding:0.6b')
        self.timeout=float(os.getenv('OLLAMA_TIMEOUT_SECONDS','180'))
        self.limit=asyncio.Semaphore(int(os.getenv('AI_CONCURRENCY_LIMIT','1')))
        self.last_request_count=0
        self._thinking_support: dict[str, bool] = {}
    async def _supports_thinking_control(self, model: str | None = None) -> bool:
        model = model or self.llm
        if model in self._thinking_support:
            return self._thinking_support[model]
        try:
            async with httpx.AsyncClient(timeout=4) as c:
                response = await c.post(self.base + '/api/show', json={'name': model})
                if not response.is_success:
                    self._thinking_support[model] = False
                else:
                    self._thinking_support[model] = ollama_supports_thinking_control(response.json())
        except (httpx.HTTPError, ValueError, TypeError):
            self._thinking_support[model] = False
        return self._thinking_support[model]
    async def tags(self)->list[str]:
        try:
            async with httpx.AsyncClient(timeout=4) as c:
                r=await c.get(self.base+'/api/tags'); r.raise_for_status()
            return [x.get('name','') for x in r.json().get('models',[])]
        except httpx.HTTPError as e: raise AIUnavailable('Ollama is unavailable. Start Ollama and pull the configured models.') from e
    async def embed(self, text:str)->list[float]:
        started=time.perf_counter()
        async with self.limit:
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as c:
                    r=await c.post(self.base+'/api/embed',json={'model':self.embedding,'input':text,'keep_alive':0})
                    if not r.is_success: raise AIUnavailable(f'Embedding request failed ({r.status_code}): {r.text[:240]}')
                    body=r.json()
                values=body.get('embeddings')
                if not isinstance(values,list) or not values or not isinstance(values[0],list): raise InvalidAIResponse('Embedding model returned no embeddings.')
                logger.info('ollama_request kind=embed model=%s duration_ms=%.1f input_chars=%s output_dims=%s', self.embedding, (time.perf_counter()-started)*1000, len(text), len(values[0]))
                return values[0]
            except httpx.HTTPError as e: raise AIUnavailable('Embedding request failed. Verify Ollama and the embedding model.') from e
    async def generate(self, prompt:str, output_format:dict[str,Any]|str|None=None, model: str | None = None)->str:
        started=time.perf_counter()
        self.last_request_count=0
        selected_model = model or self.llm
        async with self.limit:
            try:
                self.last_request_count=1
                payload={'model':selected_model,'prompt':prompt,'stream':False,'keep_alive':0,'options':{'temperature':float(os.getenv('OLLAMA_TEMPERATURE','0.2')),'num_ctx':int(os.getenv('OLLAMA_NUM_CTX','8192')),'num_predict':int(os.getenv('OLLAMA_NUM_PREDICT','1200'))}}
                if await self._supports_thinking_control(selected_model):
                    payload['think'] = False
                if output_format is not None: payload['format']=output_format
                async with httpx.AsyncClient(timeout=self.timeout) as c:
                    r=await c.post(self.base+'/api/generate',json=payload)
                    if not r.is_success:
                        details=r.text.lower()
                        if r.status_code == 500 and any(marker in details for marker in ('0xc0000409', 'stack-based buffer', 'llama-server process has terminated')):
                            raise AIUnavailable(
                                f'Ollama stopped while loading the "{self.llm}" model. '
                                'Try restarting Ollama, checking available RAM/VRAM, or selecting a smaller installed model.'
                            )
                        raise AIUnavailable(f'Generation request failed ({r.status_code}). Verify Ollama and the configured language model.')
                    body=r.json()
                answer = extract_ollama_response(body)
                if not answer.strip(): raise InvalidAIResponse('Language model returned an empty response.')
                logger.info('ollama_request kind=generate model=%s duration_ms=%.1f prompt_chars=%s response_chars=%s', selected_model, (time.perf_counter()-started)*1000, len(prompt), len(answer))
                cleaned = clean_ollama_answer(answer)
                if os.getenv('APP_ENV', 'development').lower() in {'development', 'dev', 'local'}:
                    logger.debug('ollama_response_raw=%r ollama_response_cleaned=%r', answer, cleaned)
                return cleaned
            except httpx.HTTPError as e: raise AIUnavailable('Generation request failed. Verify Ollama and the configured language model.') from e
    async def generate_chat(self, system_prompt: str, user_prompt: str) -> str:
        return await self.generate_chat_with_model(system_prompt, user_prompt, self.llm)
    async def generate_chat_with_model(self, system_prompt: str, user_prompt: str, model: str) -> str:
        started = time.perf_counter()
        async with self.limit:
            payload: dict[str, Any] = {
                'model': model,
                'messages': [
                    {'role': 'system', 'content': system_prompt},
                    {'role': 'user', 'content': user_prompt},
                ],
                'stream': False,
                'keep_alive': 0,
                'options': {
                    'temperature': float(os.getenv('OLLAMA_TEMPERATURE', '0.2')),
                    'num_ctx': int(os.getenv('OLLAMA_NUM_CTX', '8192')),
                    'num_predict': int(os.getenv('OLLAMA_NUM_PREDICT', '1200')),
                },
            }
            if await self._supports_thinking_control(model):
                payload['think'] = False
            async def request(request_payload: dict[str, Any]) -> dict[str, Any]:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.post(self.base + '/api/chat', json=request_payload)
                    if not response.is_success:
                        raise AIUnavailable(f'Generation request failed ({response.status_code}). Verify Ollama and the configured language model.')
                    return response.json()
            try:
                body = await request(payload)
                raw_answer = extract_ollama_response(body)
                if not raw_answer.strip():
                    raise InvalidAIResponse('Language model returned an empty response.')
                cleaned = clean_ollama_answer(raw_answer)
                if response_needs_repair(cleaned):
                    repair_payload = {
                        **payload,
                        'messages': payload['messages'] + [{
                            'role': 'user',
                            'content': 'Rewrite only the final answer. Remove planning, drafts, self-evaluation, repeated text, and reasoning markers. Return 1-4 concise sentences and nothing else.',
                        }],
                    }
                    repaired = clean_ollama_answer(extract_ollama_response(await request(repair_payload)))
                    if not response_needs_repair(repaired):
                        cleaned = repaired
                logger.info('ollama_request kind=chat model=%s duration_ms=%.1f prompt_chars=%s response_chars=%s', model, (time.perf_counter() - started) * 1000, len(user_prompt), len(raw_answer))
                if os.getenv('APP_ENV', 'development').lower() in {'development', 'dev', 'local'}:
                    logger.debug('ollama_response_raw=%r ollama_response_cleaned=%r', raw_answer, cleaned)
                return cleaned
            except httpx.HTTPError as e:
                raise AIUnavailable('Generation request failed. Verify Ollama and the configured language model.') from e
    async def structured(self, prompt:str, schema:type[T], model: str | None = None)->T:
        request = prompt + '\n\nReturn the JSON object required by the schema.'
        if model:
            return parse_structured(await self.generate(request, schema.model_json_schema(), model=model), schema)
        return parse_structured(await self.generate(request, schema.model_json_schema()), schema)

class GeminiProvider:
    def __init__(self):
        self.api_key=os.getenv('GEMINI_API_KEY','').strip()
        self.model=os.getenv('GEMINI_MODEL','gemini-2.0-flash')
        self.timeout=float(os.getenv('GEMINI_TIMEOUT_SECONDS','120'))
        self.retry_attempts=max(1, int(os.getenv('GEMINI_RETRY_ATTEMPTS','2')))
        self._client=None
        self.last_request_count=0
    def _get_client(self):
        if not self.api_key: raise AIConfigurationError('Gemini is not configured. Set GEMINI_API_KEY in the backend environment.')
        if self._client is None:
            try:
                from google import genai
                from google.genai import types
                self._client=genai.Client(api_key=self.api_key, http_options=types.HttpOptions(timeout=int(self.timeout*1000)))
            except ImportError as e: raise AIConfigurationError('Gemini support requires the google-genai package.') from e
        return self._client
    @staticmethod
    def _error(error: Exception) -> AICloudError:
        text=str(error).lower()
        status_match=re.search(r'\b(408|429|500|502|503|504)\b', text)
        status=status_match.group(1) if status_match else None
        auth=any(x in text for x in ('401','403','api key','authentication','unauthorized','permission'))
        quota=any(x in text for x in ('429','quota','resource exhausted','rate limit'))
        retryable=not auth and not quota and any(x in text for x in ('timeout','timed out','connection','temporarily','unavailable','deadline','503','500','502','504'))
        if auth: return AICloudError('Gemini authentication failed. Check GEMINI_API_KEY.', retryable=False)
        if quota: return AICloudError('Gemini quota or rate limit reached.', retryable=False)
        if status:
            return AICloudError(
                f'Gemini request failed with HTTP {status}. Please retry shortly.',
                retryable=retryable,
            )
        return AICloudError('Gemini request failed.' if not retryable else 'Gemini is temporarily unavailable.', retryable=retryable)
    async def generate(self, prompt:str, output_format:dict[str,Any]|str|None=None)->str:
        client=self._get_client()
        from google.genai import types
        config=types.GenerateContentConfig(temperature=0.1)
        if output_format is not None:
            config.response_mime_type='application/json'
            config.response_schema=output_format
        for attempt in range(self.retry_attempts):
            started=time.perf_counter()
            try:
                self.last_request_count += 1
                response=await asyncio.to_thread(client.models.generate_content, model=self.model, contents=prompt, config=config)
                text=getattr(response, 'text', None)
                if not isinstance(text,str) or not text.strip(): raise InvalidAIResponse('Gemini returned an empty response.')
                logger.info('gemini_request model=%s attempt=%s duration_ms=%.1f prompt_chars=%s response_chars=%s', self.model, attempt + 1, (time.perf_counter()-started)*1000, len(prompt), len(text))
                return text.strip()
            except InvalidAIResponse: raise
            except Exception as error:
                cloud_error=self._error(error)
                if not cloud_error.retryable or attempt + 1 >= self.retry_attempts:
                    raise cloud_error from error
                logger.warning('gemini_retry attempt=%s reason=%s', attempt + 1, str(cloud_error))
                await asyncio.sleep(1)
        raise AICloudError('Gemini request failed.', retryable=False)
    async def structured(self, prompt:str, schema:type[T])->T:
        return parse_structured(await self.generate(prompt, schema.model_json_schema()), schema)

class HybridAIProvider:
    def __init__(self, ollama: OllamaProvider, gemini: GeminiProvider):
        self.ollama=ollama
        self.gemini=gemini
        self.mode=os.getenv('AI_PROVIDER_MODE','auto').strip().lower()
        if self.mode not in {'auto','gemini','ollama'}: raise AIConfigurationError('AI_PROVIDER_MODE must be auto, gemini, or ollama.')
        self.last_provider='ollama'
        self.fallback_used=False
    @property
    def llm(self): return self.ollama.llm
    @property
    def embedding(self): return self.ollama.embedding
    async def tags(self): return await self.ollama.tags()
    async def embed(self, text:str): return await self.ollama.embed(text)
    def _selected_mode(self, mode: str | None) -> str:
        selected = (mode or self.mode).strip().lower()
        if selected not in {'auto', 'gemini', 'ollama'}:
            raise AIConfigurationError('AI provider mode must be auto, gemini, or ollama.')
        return selected
    async def generate(self, prompt:str, output_format:dict[str,Any]|str|None=None, *, mode: str | None = None)->str:
        selected = self._selected_mode(mode)
        if selected=='ollama':
            self.last_provider='ollama'; result=await self.ollama.generate(prompt, output_format); self.last_request_count=getattr(self.ollama, 'last_request_count', 1); return result
        if selected=='gemini':
            if not self.gemini.api_key: raise AIConfigurationError('Gemini is not configured. Set GEMINI_API_KEY in the backend environment.')
            self.last_provider='gemini'; result=await self.gemini.generate(prompt, output_format); self.last_request_count=getattr(self.gemini, 'last_request_count', 1); return result
        if not self.gemini.api_key:
            self.last_provider='ollama'; result=await self.ollama.generate(prompt, output_format); self.last_request_count=getattr(self.ollama, 'last_request_count', 1); return result
        try:
            result=await self.gemini.generate(prompt, output_format); self.last_provider='gemini'; self.last_request_count=getattr(self.gemini, 'last_request_count', 1); return result
        except AICloudError as e:
            if not e.retryable: raise
            logger.warning('gemini_fallback reason=%s', str(e))
            self.fallback_used=True
            gemini_requests=getattr(self.gemini, 'last_request_count', 1)
            result=await self.ollama.generate(prompt, output_format); self.last_provider='ollama'; self.last_request_count=gemini_requests + getattr(self.ollama, 'last_request_count', 1); return result
    async def generate_chat(self, system_prompt: str, user_prompt: str, *, mode: str | None = None) -> str:
        selected = self._selected_mode(mode)
        if selected == 'ollama':
            self.last_provider = 'ollama'
            return await self.ollama.generate_chat(system_prompt, user_prompt)
        if selected == 'gemini':
            if not self.gemini.api_key:
                raise AIConfigurationError('Gemini is not configured. Set GEMINI_API_KEY in the backend environment.')
            self.last_provider = 'gemini'
            return await self.gemini.generate(user_prompt)
        if not self.gemini.api_key:
            self.last_provider = 'ollama'
            return await self.ollama.generate_chat(system_prompt, user_prompt)
        self.last_provider = 'gemini'
        return await self.gemini.generate(user_prompt)
    async def structured(self, prompt:str, schema:type[T], *, mode: str | None = None, model: str | None = None)->T:
        selected = self._selected_mode(mode)
        if selected=='ollama':
            self.last_provider='ollama'; result=await self.ollama.structured(prompt, schema, model=model); self.last_request_count=getattr(self.ollama, 'last_request_count', 1); return result
        if selected=='gemini':
            if not self.gemini.api_key: raise AIConfigurationError('Gemini is not configured. Set GEMINI_API_KEY in the backend environment.')
            self.last_provider='gemini'; result=await self.gemini.structured(prompt, schema); self.last_request_count=getattr(self.gemini, 'last_request_count', 1); return result
        if not self.gemini.api_key:
            self.last_provider='ollama'; result=await self.ollama.structured(prompt, schema); self.last_request_count=getattr(self.ollama, 'last_request_count', 1); return result
        try:
            result=await self.gemini.structured(prompt, schema); self.last_provider='gemini'; self.last_request_count=getattr(self.gemini, 'last_request_count', 1); return result
        except AICloudError as e:
            if not e.retryable: raise
            logger.warning('gemini_fallback reason=%s', str(e))
            self.fallback_used=True
            gemini_requests=getattr(self.gemini, 'last_request_count', 1)
            result=await self.ollama.structured(prompt, schema); self.last_provider='ollama'; self.last_request_count=gemini_requests + getattr(self.ollama, 'last_request_count', 1); return result
        except InvalidAIResponse as e:
            logger.warning('gemini_fallback reason=invalid_structured_output')
            self.fallback_used=True
            gemini_requests=getattr(self.gemini, 'last_request_count', 1)
            result=await self.ollama.structured(prompt, schema); self.last_provider='ollama'; self.last_request_count=gemini_requests + getattr(self.ollama, 'last_request_count', 1); return result

ollama_provider=OllamaProvider()
gemini_provider=GeminiProvider()
provider=HybridAIProvider(ollama_provider, gemini_provider)
