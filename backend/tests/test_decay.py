from datetime import datetime, timedelta, timezone
from app.main import Profile, decay

def profile(attempts=4, correct=4, days=0):
    p=Profile(user_id=1, concept_id=1, attempts=attempts, correct=correct)
    p.last_success=datetime.now(timezone.utc)-timedelta(days=days)
    return p

def test_no_evidence_has_no_claimed_decay():
    assert decay(Profile(user_id=1,concept_id=1,attempts=0,correct=0), datetime.now(timezone.utc)) is None

def test_time_increases_decay_risk():
    now=datetime.now(timezone.utc)
    assert decay(profile(days=20),now) > decay(profile(days=1),now)

def test_incorrect_answers_increase_risk():
    now=datetime.now(timezone.utc)
    assert decay(profile(4,1),now) > decay(profile(4,4),now)

