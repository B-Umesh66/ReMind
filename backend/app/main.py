"""ReMind API: a local-first adaptive learning service."""
from __future__ import annotations
import os, re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional
import httpx
import jwt
from passlib.context import CryptContext
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker

ROOT = Path(__file__).resolve().parents[2]
DATABASE_URL = os.getenv('DATABASE_URL', f"sqlite:///{ROOT / 'remind.db'}")
engine = create_engine(DATABASE_URL, connect_args={'check_same_thread': False} if DATABASE_URL.startswith('sqlite') else {})
SessionLocal = sessionmaker(bind=engine, autoflush=False)
security = HTTPBearer(auto_error=False)
passwords = CryptContext(schemes=['pbkdf2_sha256'], deprecated='auto')
JWT_SECRET = os.getenv('JWT_SECRET', 'development-only-change-me')

class Base(DeclarativeBase): pass
class User(Base):
    __tablename__='users'
    id: Mapped[int] = mapped_column(primary_key=True); email: Mapped[str] = mapped_column(String(255), unique=True); password_hash: Mapped[str] = mapped_column(String(128)); created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
class Document(Base):
    __tablename__='documents'
    id: Mapped[int] = mapped_column(primary_key=True); user_id: Mapped[int] = mapped_column(ForeignKey('users.id')); name: Mapped[str] = mapped_column(String(255)); status: Mapped[str] = mapped_column(String(32), default='uploaded'); text: Mapped[str] = mapped_column(Text, default=''); created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    chunks: Mapped[list['Chunk']] = relationship(cascade='all, delete-orphan')
class Chunk(Base):
    __tablename__='document_chunks'
    id: Mapped[int] = mapped_column(primary_key=True); document_id: Mapped[int] = mapped_column(ForeignKey('documents.id')); ordinal: Mapped[int] = mapped_column(Integer); page: Mapped[Optional[int]] = mapped_column(Integer, nullable=True); content: Mapped[str] = mapped_column(Text)
class Concept(Base):
    __tablename__='concepts'
    id: Mapped[int] = mapped_column(primary_key=True); user_id: Mapped[int] = mapped_column(ForeignKey('users.id')); name: Mapped[str] = mapped_column(String(255)); topic: Mapped[str] = mapped_column(String(255), default='General'); evidence: Mapped[str] = mapped_column(Text, default='')
class Profile(Base):
    __tablename__='knowledge_profiles'
    id: Mapped[int] = mapped_column(primary_key=True); user_id: Mapped[int] = mapped_column(ForeignKey('users.id')); concept_id: Mapped[int] = mapped_column(ForeignKey('concepts.id')); attempts: Mapped[int] = mapped_column(Integer, default=0); correct: Mapped[int] = mapped_column(Integer, default=0); last_success: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True); decay_risk: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
class Revision(Base):
    __tablename__='revision_recommendations'
    id: Mapped[int] = mapped_column(primary_key=True); user_id: Mapped[int] = mapped_column(ForeignKey('users.id')); concept_id: Mapped[int] = mapped_column(ForeignKey('concepts.id')); priority: Mapped[int] = mapped_column(Integer); reason: Mapped[str] = mapped_column(Text); activity: Mapped[str] = mapped_column(String(120)); due_at: Mapped[datetime] = mapped_column(DateTime); status: Mapped[str] = mapped_column(String(24), default='pending')

Base.metadata.create_all(engine)
def db():
    with SessionLocal() as s: yield s
def token_for(user: User):
    return jwt.encode({'sub': str(user.id), 'exp': datetime.now(timezone.utc)+timedelta(hours=12)}, JWT_SECRET, algorithm='HS256')
def current_user(token: HTTPAuthorizationCredentials = Depends(security), session: Session = Depends(db)):
    if not token: raise HTTPException(401, 'Sign in required')
    try: subject=jwt.decode(token.credentials, JWT_SECRET, algorithms=['HS256']).get('sub')
    except jwt.PyJWTError: subject=None
    user = session.scalar(select(User).where(User.id == int(subject))) if subject and subject.isdigit() else None
    if not user: raise HTTPException(401, 'Invalid session')
    return user
def split_text(text: str, size=700, overlap=100):
    start=0
    while start < len(text):
        end=min(len(text), start+size); yield text[start:end]; start += size-overlap
def decay(profile: Profile, now: datetime):
    """Explainable risk: uncertainty dominates without assessment evidence."""
    if profile.attempts == 0: return None
    accuracy=profile.correct/profile.attempts
    days=(now-(profile.last_success or now)).total_seconds()/86400
    return min(100, round(45*(1-accuracy)+min(45, days*3)+min(10, profile.attempts)))

app=FastAPI(title='ReMind API', version='0.1.0')
app.add_middleware(CORSMiddleware, allow_origins=['http://localhost:5173'], allow_methods=['*'], allow_headers=['*'])
class Credentials(BaseModel): email: str; password: str = Field(min_length=8)
class RevisionUpdate(BaseModel): status: str
@app.get('/api/v1/health')
async def health():
    url=os.getenv('OLLAMA_BASE_URL','http://localhost:11434')
    try:
        async with httpx.AsyncClient(timeout=2) as c: ok=(await c.get(url+'/api/tags')).is_success
    except httpx.HTTPError: ok=False
    return {'status':'ok','database':'postgresql' if DATABASE_URL.startswith('postgres') else 'sqlite development fallback','ollama_available':ok,'models':{'llm':os.getenv('OLLAMA_LLM_MODEL','qwen3:4b'),'embedding':os.getenv('OLLAMA_EMBEDDING_MODEL','qwen3-embedding:0.6b')}}
@app.post('/api/v1/auth/register')
def register(body: Credentials, s:Session=Depends(db)):
    if s.scalar(select(User).where(User.email==body.email)): raise HTTPException(409,'Email already registered')
    u=User(email=body.email,password_hash=passwords.hash(body.password)); s.add(u); s.commit(); s.refresh(u); return {'access_token':token_for(u),'user':{'id':u.id,'email':u.email}}
@app.post('/api/v1/auth/login')
def login(body: Credentials,s:Session=Depends(db)):
    u=s.scalar(select(User).where(User.email==body.email))
    if not u or not passwords.verify(body.password, u.password_hash): raise HTTPException(401,'Incorrect email or password')
    return {'access_token':token_for(u),'user':{'id':u.id,'email':u.email}}
@app.get('/api/v1/dashboard')
def dashboard(u:User=Depends(current_user),s:Session=Depends(db)):
    docs=s.scalars(select(Document).where(Document.user_id==u.id)).all(); concepts=s.scalars(select(Concept).where(Concept.user_id==u.id)).all(); profiles=s.scalars(select(Profile).where(Profile.user_id==u.id)).all(); revisions=s.scalars(select(Revision).where(Revision.user_id==u.id,Revision.status=='pending').order_by(Revision.priority.desc())).all()
    return {'documents':len(docs),'processed_documents':sum(d.status=='processed' for d in docs),'concepts':len(concepts),'assessed_concepts':sum(p.attempts>0 for p in profiles),'at_risk':sum((p.decay_risk or 0)>=60 for p in profiles),'recommendations':[{'id':r.id,'concept':next((c.name for c in concepts if c.id==r.concept_id),'Unknown'),'priority':r.priority,'reason':r.reason,'activity':r.activity,'due_at':r.due_at,'status':r.status} for r in revisions]}
@app.get('/api/v1/documents')
def documents(u:User=Depends(current_user),s:Session=Depends(db)): return [{'id':d.id,'name':d.name,'status':d.status,'created_at':d.created_at} for d in s.scalars(select(Document).where(Document.user_id==u.id)).all()]
@app.post('/api/v1/documents')
async def upload(file:UploadFile=File(...),u:User=Depends(current_user),s:Session=Depends(db)):
    suffix=Path(file.filename or '').suffix.lower()
    if suffix not in {'.txt','.md','.pdf','.docx'}: raise HTTPException(415,'Supported files: PDF, DOCX, TXT, Markdown')
    raw=await file.read()
    if len(raw)>int(os.getenv('MAX_UPLOAD_MB','20'))*1024*1024: raise HTTPException(413,'File exceeds upload limit')
    try:
        if suffix in {'.txt','.md'}: text=raw.decode('utf-8')
        elif suffix=='.pdf':
            import fitz; text='\n'.join(page.get_text() for page in fitz.open(stream=raw,filetype='pdf'))
        else:
            from docx import Document as Word; import io; text='\n'.join(p.text for p in Word(io.BytesIO(raw)).paragraphs)
    except Exception as e: raise HTTPException(422,f'Could not extract text: {e}')
    if not text.strip(): raise HTTPException(422,'No selectable text found. This may be a scanned document requiring OCR.')
    doc=Document(user_id=u.id,name=file.filename or 'Untitled',status='processing',text=text);s.add(doc);s.flush()
    for ix,content in enumerate(split_text(text)): s.add(Chunk(document_id=doc.id,ordinal=ix,page=None,content=content))
    # Candidate concepts are transparent heuristics until an Ollama extraction pass is added.
    for name in list(dict.fromkeys(re.findall(r'(?m)^#{1,3}\s+(.+)$',text)))[:20]:
        c=Concept(user_id=u.id,name=name.strip()[:255],topic=doc.name,evidence='Document heading');s.add(c);s.flush();s.add(Profile(user_id=u.id,concept_id=c.id))
    doc.status='processed';s.commit();return {'id':doc.id,'status':doc.status,'chunks':len(list(split_text(text)))}
@app.delete('/api/v1/documents/{document_id}')
def delete_document(document_id:int,u:User=Depends(current_user),s:Session=Depends(db)):
    d=s.scalar(select(Document).where(Document.id==document_id,Document.user_id==u.id))
    if not d: raise HTTPException(404,'Document not found')
    s.delete(d);s.commit();return {'deleted':True}
@app.get('/api/v1/concepts')
def concepts(u:User=Depends(current_user),s:Session=Depends(db)):
    cs=s.scalars(select(Concept).where(Concept.user_id==u.id)).all(); ps={p.concept_id:p for p in s.scalars(select(Profile).where(Profile.user_id==u.id))}
    return [{'id':c.id,'name':c.name,'topic':c.topic,'evidence':c.evidence,'attempts':ps[c.id].attempts,'decay_risk':ps[c.id].decay_risk} for c in cs]
@app.post('/api/v1/revisions/rebuild')
def rebuild_revisions(u:User=Depends(current_user),s:Session=Depends(db)):
    now=datetime.now(timezone.utc); profiles=s.scalars(select(Profile).where(Profile.user_id==u.id)).all(); cs={c.id:c for c in s.scalars(select(Concept).where(Concept.user_id==u.id))}
    count=0
    for p in profiles:
        p.decay_risk=decay(p,now)
        if p.decay_risk is not None and p.decay_risk>=50:
            s.add(Revision(user_id=u.id,concept_id=p.concept_id,priority=p.decay_risk,reason=f'Decay risk is {p.decay_risk}% based on recall accuracy and time since successful recall.',activity='Quick recall check',due_at=now+timedelta(days=1)));count+=1
    s.commit();return {'created':count}
@app.patch('/api/v1/revisions/{revision_id}')
def revise(revision_id:int,body:RevisionUpdate,u:User=Depends(current_user),s:Session=Depends(db)):
    r=s.scalar(select(Revision).where(Revision.id==revision_id,Revision.user_id==u.id))
    if not r: raise HTTPException(404,'Recommendation not found')
    if body.status not in {'completed','skipped','snoozed','pending'}: raise HTTPException(422,'Invalid status')
    r.status=body.status;s.commit();return {'id':r.id,'status':r.status}
