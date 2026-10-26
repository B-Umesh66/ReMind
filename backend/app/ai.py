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
GROQ_MODEL_OPTIONS = ('openai/gpt-oss-20b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-120b')
GEMINI_MODEL_OPTIONS = (
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash-lite',
)
GEMINI_DEFAULT_MODEL = 'gemini-3.1-flash-lite'
GEMINI_MODEL_LABELS = {
    'gemini-3.1-flash-lite': 'Gemini 3.1 Flash Lite',
    'gemini-3.5-flash-lite': 'Gemini 3.5 Flash Lite',
}
GEMINI_ALL_SUPPORTED_MODELS = (
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash-lite',
)


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
        self._api_key = os.getenv('GEMINI_API_KEY', '').strip()
        self.model = os.getenv('GEMINI_MODEL', GEMINI_DEFAULT_MODEL)
        self.timeout = float(os.getenv('GEMINI_TIMEOUT_SECONDS', '120'))
        self.retry_attempts = max(1, int(os.getenv('GEMINI_RETRY_ATTEMPTS', '2')))
        self._client = None
        self.last_request_count = 0

    @property
    def api_key(self) -> str:
        dotenv_path = Path(__file__).resolve().parents[1] / '.env'
        if dotenv_path.is_file():
            load_dotenv(dotenv_path, override=True)
        key = os.getenv('GEMINI_API_KEY', '').strip()
        return key or self._api_key

    @api_key.setter
    def api_key(self, value: str):
        self._api_key = value.strip() if isinstance(value, str) else ''
        self._client = None
        self._client_key = None

    def _get_client(self):
        key = self.api_key
        if not key: raise AIConfigurationError('Gemini is not configured. Set GEMINI_API_KEY in the backend environment.')
        if self._client is None or getattr(self, '_client_key', None) != key:
            try:
                from google import genai
                from google.genai import types
                self._client = genai.Client(api_key=key, http_options=types.HttpOptions(timeout=int(self.timeout*1000)))
                self._client_key = key
            except ImportError as e: raise AIConfigurationError('Gemini support requires the google-genai package.') from e
        return self._client

    @staticmethod
    def _error(error: Exception, model: str | None = None) -> AICloudError:
        text = str(error).lower()
        model_str = f" for model '{model}'" if model else ""
        if '404' in text or 'not_found' in text or 'not found' in text or 'no longer available' in text:
            if 'no longer available' in text or 'deprecated' in text:
                return AICloudError(f"Gemini model '{model or 'requested'}' is deprecated or no longer available to your account. Please select a supported model such as Gemini 3.5 Flash-Lite or Gemini 3.1 Flash-Lite.", retryable=False)
            return AICloudError(f"Gemini model '{model or 'requested'}' was not found. Please verify your model selection.", retryable=False)
        auth = any(x in text for x in ('401', '403', 'api key', 'authentication', 'unauthorized', 'permission'))
        if auth:
            return AICloudError('Gemini authentication failed. Please verify your GEMINI_API_KEY in backend environment.', retryable=False)
        quota = any(x in text for x in ('429', 'quota', 'resource exhausted', 'rate limit'))
        if quota:
            if 'daily' in text or 'per day' in text or 'exhausted' in text:
                return AICloudError(f'Gemini daily quota exhausted{model_str}. Please select another model or try again tomorrow.', retryable=False)
            return AICloudError(f'Gemini rate limit reached{model_str}. Please wait a moment before retrying.', retryable=False)
        if '503' in text or 'unavailable' in text or 'high demand' in text:
            return AICloudError(f'Gemini service{model_str} is temporarily unavailable or experiencing high demand. Please retry shortly.', retryable=True)
        status_match = re.search(r'\b(408|500|502|504)\b', text)
        status = status_match.group(1) if status_match else None
        retryable = any(x in text for x in ('timeout', 'timed out', 'connection', 'temporarily', 'deadline', '500', '502', '504'))
        if status:
            return AICloudError(f'Gemini request failed with HTTP {status}. Please retry shortly.', retryable=retryable)
        return AICloudError(f'Gemini request failed{model_str}.' if not retryable else f'Gemini is temporarily unavailable{model_str}.', retryable=retryable)

    async def generate(self, prompt:str, output_format:dict[str,Any]|str|None=None, model: str | None = None)->str:
        client=self._get_client()
        from google.genai import types
        selected_model = model or self.model or GEMINI_DEFAULT_MODEL
        config=types.GenerateContentConfig(temperature=0.1)
        if output_format is not None:
            config.response_mime_type='application/json'
            config.response_schema=output_format
        for attempt in range(self.retry_attempts):
            started=time.perf_counter()
            try:
                self.last_request_count += 1
                response=await asyncio.to_thread(client.models.generate_content, model=selected_model, contents=prompt, config=config)
                text=getattr(response, 'text', None)
                if not isinstance(text,str) or not text.strip(): raise InvalidAIResponse('Gemini returned an empty response.')
                logger.info('gemini_request model=%s attempt=%s duration_ms=%.1f prompt_chars=%s response_chars=%s', selected_model, attempt + 1, (time.perf_counter()-started)*1000, len(prompt), len(text))
                return text.strip()
            except InvalidAIResponse: raise
            except Exception as error:
                logger.exception('gemini_raw_error model=%s error=%r', selected_model, error)
                cloud_error=self._error(error, selected_model)
                if not cloud_error.retryable or attempt + 1 >= self.retry_attempts:
                    raise cloud_error from error
                logger.warning('gemini_retry model=%s attempt=%s reason=%s', selected_model, attempt + 1, str(cloud_error))
                await asyncio.sleep(1)
        raise AICloudError(f"Gemini request failed for model '{selected_model}'.", retryable=False)

    async def structured(self, prompt:str, schema:type[T], model: str | None = None)->T:
        selected_model = model or self.model or GEMINI_DEFAULT_MODEL
        return parse_structured(await self.generate(prompt, schema.model_json_schema(), model=selected_model), schema)

class GroqProvider:
    """OpenAI‑compatible client for Groq API."""
    def __init__(self):
        self.base = os.getenv('GROQ_API_BASE', 'https://api.groq.com/openai/v1').rstrip('/')
        self._api_key = os.getenv('GROQ_API_KEY', '').strip()
        self.timeout = float(os.getenv('GROQ_TIMEOUT_SECONDS', '120'))
        self.retry_attempts = max(1, int(os.getenv('GROQ_RETRY_ATTEMPTS', '2')))
        self.last_request_count = 0

    @property
    def api_key(self) -> str:
        key = os.getenv('GROQ_API_KEY', '').strip()
        if not key:
            dotenv_path = Path(__file__).resolve().parents[1] / '.env'
            if dotenv_path.is_file():
                load_dotenv(dotenv_path, override=True)
                key = os.getenv('GROQ_API_KEY', '').strip()
        return key or self._api_key

    @api_key.setter
    def api_key(self, value: str):
        self._api_key = value.strip() if isinstance(value, str) else ''

    async def _post(self, endpoint: str, payload: dict) -> dict:
        key = self.api_key
        if not key:
            raise AIConfigurationError('Groq is not configured. Set GROQ_API_KEY in backend/.env.')
        headers = {'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}
        for attempt in range(self.retry_attempts):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.post(f'{self.base}{endpoint}', json=payload, headers=headers)
                    if response.status_code >= 500:
                        raise AICloudError(f'Groq server error {response.status_code}', retryable=True)
                    if response.status_code == 401:
                        raise AIConfigurationError('Groq authentication failed. Check GROQ_API_KEY.')
                    response.raise_for_status()
                    return response.json()
            except (AIConfigurationError, InvalidAIResponse):
                raise
            except AICloudError as e:
                if not e.retryable or attempt + 1 >= self.retry_attempts:
                    raise
                await asyncio.sleep(1)
            except httpx.HTTPError as e:
                if attempt + 1 >= self.retry_attempts:
                    raise AIUnavailable(f'Groq request failed: {e}') from e
                await asyncio.sleep(1)
        raise AIUnavailable('Groq request failed after retry attempts.')

    async def generate(self, prompt: str, output_format: dict | str | None = None, model: str | None = None) -> str:
        selected = model or os.getenv('GROQ_DEFAULT_MODEL', GROQ_MODEL_OPTIONS[0])
        payload = {
            'model': selected,
            'messages': [{'role': 'user', 'content': prompt}],
            'temperature': float(os.getenv('GROQ_TEMPERATURE', '0.2'))
        }
        if output_format is not None:
            payload['response_format'] = output_format
        self.last_request_count = 1
        body = await self._post('/chat/completions', payload)
        try:
            content = body['choices'][0]['message']['content']
        except (KeyError, IndexError):
            raise InvalidAIResponse('Groq returned an unexpected response format.')
        if not isinstance(content, str) or not content.strip():
            raise InvalidAIResponse('Groq returned an empty response.')
        return content.strip()

    async def generate_chat(self, system_prompt: str, user_prompt: str, model: str | None = None) -> str:
        selected = model or os.getenv('GROQ_DEFAULT_MODEL', GROQ_MODEL_OPTIONS[0])
        payload = {
            'model': selected,
            'messages': [
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': user_prompt},
            ],
            'temperature': float(os.getenv('GROQ_TEMPERATURE', '0.2'))
        }
        self.last_request_count = 1
        body = await self._post('/chat/completions', payload)
        try:
            content = body['choices'][0]['message']['content']
        except (KeyError, IndexError):
            raise InvalidAIResponse('Groq chat returned an unexpected response format.')
        if not isinstance(content, str) or not content.strip():
            raise InvalidAIResponse('Groq chat returned an empty response.')
        return content.strip()

    async def structured(self, prompt: str, schema: type[T], model: str | None = None) -> T:
        selected = model or os.getenv('GROQ_DEFAULT_MODEL', GROQ_MODEL_OPTIONS[0])
        payload = {
            'model': selected,
            'messages': [{'role': 'user', 'content': prompt + '\n\nReturn the JSON object required by the schema.'}],
            'temperature': 0.0,
        }
        self.last_request_count = 1
        body = await self._post('/chat/completions', payload)
        try:
            content = body['choices'][0]['message']['content']
        except (KeyError, IndexError):
            raise InvalidAIResponse('Groq structured response missing.')
        return parse_structured(content, schema)

class HybridAIProvider:
    def __init__(self, ollama: OllamaProvider, gemini: GeminiProvider, groq: GroqProvider | None = None):
        self.ollama = ollama
        self.gemini = gemini
        self.groq = groq if groq is not None else GroqProvider()
        self.mode = os.getenv('AI_PROVIDER_MODE', 'ollama').strip().lower()
        if self.mode not in {'gemini', 'ollama', 'groq', 'auto'}:
            raise AIConfigurationError('AI_PROVIDER_MODE must be gemini, ollama, or groq.')
        self.last_provider = 'ollama'
        self.fallback_used = False
    @property
    def llm(self): return self.ollama.llm
    @property
    def embedding(self): return self.ollama.embedding
    async def tags(self): return await self.ollama.tags()
    async def embed(self, text:str): return await self.ollama.embed(text)
    def _selected_mode(self, mode: str | None) -> str:
        selected = (mode or self.mode).strip().lower()
        if selected not in {'gemini', 'ollama', 'groq', 'auto'}:
            raise AIConfigurationError('AI provider mode must be gemini, ollama, or groq.')
        return selected
    async def generate(self, prompt:str, output_format:dict[str,Any]|str|None=None, *, mode: str | None = None, model: str | None = None)->str:
        selected = self._selected_mode(mode)
        if selected=='ollama':
            self.last_provider='ollama'
            result = await (self.ollama.generate(prompt, output_format, model=model) if model else self.ollama.generate(prompt, output_format))
            self.last_request_count = getattr(self.ollama, 'last_request_count', 1)
            return result
        if selected=='gemini':
            if not self.gemini.api_key:
                raise AIConfigurationError('Gemini is not configured. Set GEMINI_API_KEY in the backend environment.')
            self.last_provider='gemini'
            result = await (self.gemini.generate(prompt, output_format, model=model) if model else self.gemini.generate(prompt, output_format))
            self.last_request_count = getattr(self.gemini, 'last_request_count', 1)
            return result
        if selected=='groq':
            self.last_provider='groq'
            result = await self.groq.generate(prompt, output_format, model=model)
            self.last_request_count = getattr(self.groq, 'last_request_count', 1)
            return result
        # 'auto' mode fallback
        if not self.gemini.api_key:
            self.last_provider='ollama'
            result = await (self.ollama.generate(prompt, output_format, model=model) if model else self.ollama.generate(prompt, output_format))
            self.last_request_count = getattr(self.ollama, 'last_request_count', 1)
            return result
        try:
            self.last_provider='gemini'
            result = await (self.gemini.generate(prompt, output_format, model=model) if model else self.gemini.generate(prompt, output_format))
            self.last_request_count = getattr(self.gemini, 'last_request_count', 1)
            return result
        except AICloudError as e:
            if not e.retryable: raise
            logger.warning('gemini_fallback reason=%s', str(e))
            self.fallback_used=True
            gemini_requests=getattr(self.gemini, 'last_request_count', 1)
            result = await (self.ollama.generate(prompt, output_format, model=model) if model else self.ollama.generate(prompt, output_format))
            self.last_provider='ollama'
            self.last_request_count=gemini_requests + getattr(self.ollama, 'last_request_count', 1)
            return result

    async def generate_chat(self, system_prompt: str, user_prompt: str, *, mode: str | None = None, model: str | None = None) -> str:
        selected = self._selected_mode(mode)
        if selected == 'ollama':
            self.last_provider = 'ollama'
            if model:
                return await self.ollama.generate_chat_with_model(system_prompt, user_prompt, model)
            return await self.ollama.generate_chat(system_prompt, user_prompt)
        if selected == 'gemini':
            if not self.gemini.api_key:
                raise AIConfigurationError('Gemini is not configured. Set GEMINI_API_KEY in the backend environment.')
            self.last_provider = 'gemini'
            full_prompt = f"{system_prompt}\n\n{user_prompt}" if system_prompt else user_prompt
            return await (self.gemini.generate(full_prompt, model=model) if model else self.gemini.generate(full_prompt))
        if selected == 'groq':
            self.last_provider = 'groq'
            return await self.groq.generate_chat(system_prompt, user_prompt, model=model)
        # 'auto' mode
        if not self.gemini.api_key:
            self.last_provider = 'ollama'
            return await self.ollama.generate_chat(system_prompt, user_prompt)
        self.last_provider = 'gemini'
        full_prompt = f"{system_prompt}\n\n{user_prompt}" if system_prompt else user_prompt
        try:
            return await (self.gemini.generate(full_prompt, model=model) if model else self.gemini.generate(full_prompt))
        except AICloudError as error:
            if not error.retryable:
                raise
            logger.warning('gemini_chat_fallback reason=%s', str(error))
            self.fallback_used = True
            result = await self.ollama.generate_chat(system_prompt, user_prompt)
            self.last_provider = 'ollama'
            return result

    async def structured(self, prompt:str, schema:type[T], *, mode: str | None = None, model: str | None = None)->T:
        selected = self._selected_mode(mode)
        if selected=='ollama':
            self.last_provider='ollama'
            result = await (self.ollama.structured(prompt, schema, model=model) if model else self.ollama.structured(prompt, schema))
            self.last_request_count = getattr(self.ollama, 'last_request_count', 1)
            return result
        if selected=='gemini':
            if not self.gemini.api_key:
                raise AIConfigurationError('Gemini is not configured. Set GEMINI_API_KEY in the backend environment.')
            self.last_provider='gemini'
            result = await (self.gemini.structured(prompt, schema, model=model) if model else self.gemini.structured(prompt, schema))
            self.last_request_count = getattr(self.gemini, 'last_request_count', 1)
            return result
        if selected=='groq':
            self.last_provider='groq'
            result = await self.groq.structured(prompt, schema, model=model)
            self.last_request_count = getattr(self.groq, 'last_request_count', 1)
            return result
        # 'auto' mode
        if not self.gemini.api_key:
            self.last_provider='ollama'
            result = await (self.ollama.structured(prompt, schema, model=model) if model else self.ollama.structured(prompt, schema))
            self.last_request_count = getattr(self.ollama, 'last_request_count', 1)
            return result
        try:
            result = await (self.gemini.structured(prompt, schema, model=model) if model else self.gemini.structured(prompt, schema))
            self.last_provider='gemini'
            self.last_request_count = getattr(self.gemini, 'last_request_count', 1)
            return result
        except AICloudError as e:
            if not e.retryable: raise
            logger.warning('gemini_fallback reason=%s', str(e))
            self.fallback_used=True
            gemini_requests=getattr(self.gemini, 'last_request_count', 1)
            result = await (self.ollama.structured(prompt, schema, model=model) if model else self.ollama.structured(prompt, schema))
            self.last_provider='ollama'
            self.last_request_count=gemini_requests + getattr(self.ollama, 'last_request_count', 1)
            return result
        except InvalidAIResponse:
            logger.warning('gemini_fallback reason=invalid_structured_output')
            self.fallback_used=True
            gemini_requests=getattr(self.gemini, 'last_request_count', 1)
            result = await (self.ollama.structured(prompt, schema, model=model) if model else self.ollama.structured(prompt, schema))
            self.last_provider='ollama'
            self.last_request_count=gemini_requests + getattr(self.ollama, 'last_request_count', 1)
            return result

ollama_provider=OllamaProvider()
gemini_provider=GeminiProvider()
groq_provider=GroqProvider()
provider=HybridAIProvider(ollama_provider, gemini_provider, groq_provider)
