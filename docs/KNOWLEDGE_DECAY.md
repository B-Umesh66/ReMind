# Knowledge decay

The current engine is deterministic and runs independently of the LLM. It combines observed accuracy, elapsed time since successful recall, and attempts. A missing assessment history yields no risk score rather than a fabricated estimate. The function is covered by `backend/tests/test_decay.py`.

