def test_clean_ollama_response_removes_reasoning_wrapper_and_preserves_markdown():
    from app.ai import clean_ollama_response

    answer = '<think>Internal reasoning should not be shown.</think>\nFinal response:\nA stack uses **LIFO** order.\n```python\nstack.pop()\n```'
    assert clean_ollama_response(answer) == 'A stack uses **LIFO** order.\n```python\nstack.pop()\n```'

def test_clean_ollama_response_does_not_remove_unmarked_answer_text():
    from app.ai import clean_ollama_response

    answer = 'Use the literal text `<think>` in this code example.'
    assert clean_ollama_response(answer) == answer

def test_clean_ollama_response_discards_draft_before_unpaired_reasoning_marker():
    from app.ai import clean_ollama_response

    answer = (
        'The model draft and self-review should not be shown.\n'
        'I think the answer should be concise.\n'
        '</think>\n\n'
        'A stack is a data structure that follows the Last-In-First-Out (LIFO) principle. '
        'Elements are added and removed only from the top.'
    )
    assert clean_ollama_response(answer) == (
        'A stack is a data structure that follows the Last-In-First-Out (LIFO) principle. '
        'Elements are added and removed only from the top.'
    )

def test_ollama_thinking_capability_supports_current_and_legacy_metadata():
    from app.ai import ollama_supports_thinking_control

    assert ollama_supports_thinking_control({'thinking': {'values': [True], 'default': True}})
    assert ollama_supports_thinking_control({'capabilities': ['completion', 'thinking']})
    assert not ollama_supports_thinking_control({'thinking': {'values': [False], 'default': False}})

def test_clean_ollama_response_extracts_answer_after_explicit_final_label():
    from app.ai import clean_ollama_response

    answer = (
        'Let me draft a concise answer and consider alternatives.\n'
        'However, I should not reveal my reasoning.\n\n'
        'Final response:\n'
        'A stack is a data structure that follows the LIFO principle.'
    )
    assert clean_ollama_response(answer) == (
        'A stack is a data structure that follows the LIFO principle.'
    )

def test_ollama_response_helpers_handle_chat_shape_and_duplicate_paragraphs():
    from app.ai import clean_ollama_answer, extract_ollama_response

    body = {'message': {'role': 'assistant', 'content': 'A stack follows LIFO.\n\nA stack follows LIFO.'}}
    assert extract_ollama_response(body) == 'A stack follows LIFO.\n\nA stack follows LIFO.'
    assert clean_ollama_answer(extract_ollama_response(body)) == 'A stack follows LIFO.'

def test_ollama_response_helpers_reject_empty_or_malformed_content():
    import pytest
    from app.ai import InvalidAIResponse, clean_ollama_answer, extract_ollama_response

    assert extract_ollama_response({'message': {'role': 'assistant'}}) == ''
    with pytest.raises(InvalidAIResponse):
        clean_ollama_answer('')

def test_clean_ollama_response_removes_plain_text_planning_without_think_tags():
    from app.ai import clean_ollama_response

    answer = (
        'We are given a user question and must return only the final answer.\n\n'
        'Definition of a stack: A stack is a linear data structure that follows the '
        'Last-In-First-Out (LIFO) principle. Elements are added and removed from the top.\n\n'
        'We must be concise and return only the answer.'
    )
    assert clean_ollama_response(answer) == (
        'A stack is a linear data structure that follows the Last-In-First-Out (LIFO) '
        'principle. Elements are added and removed from the top.'
    )

def test_chat_history_context_prioritizes_latest_question_and_bounds_old_answers():
    from app.main import ChatMessage, chat_history_context

    old_answer = 'unnecessary explanation ' * 500
    messages = [
        ChatMessage(role='assistant', content=old_answer, conversation_id=1),
        ChatMessage(role='user', content='What is a stack?', conversation_id=1),
    ]
    prompt_context = chat_history_context(messages, 'What is the need for a stack?')
    assert '<latest_user_question>\nWhat is the need for a stack?' in prompt_context
    assert len(prompt_context) < 1600
