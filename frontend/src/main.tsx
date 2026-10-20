import { Component, ReactNode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BookOpen, BrainCircuit, ChartNoAxesCombined, ChevronRight, Clock3, FileUp, Grid2X2, Library, Menu, MoreHorizontal, Plus, RotateCw, Sparkles, Target, X } from 'lucide-react'
import './styles.css'

const API='/api/v1'
type Dashboard={documents:number;processed_documents:number;concepts:number;assessed_concepts:number;at_risk:number;recommendations:any[]}
const demo:Dashboard={documents:0,processed_documents:0,concepts:0,assessed_concepts:0,at_risk:0,recommendations:[]}

class ErrorBoundary extends Component<{children:ReactNode},{error:boolean}>{
  state={error:false}; static getDerivedStateFromError(){return {error:true}}
  render(){return this.state.error?<main className="gate"><div className="logo"><span>r</span> ReMind</div><h1>Something prevented<br/><i>the interface from loading.</i></h1><p className="lead">Please refresh this page. If it persists, start the frontend with <code>npm run dev</code> from the frontend folder.</p></main>:this.props.children}
}

function App(){
  const [token,setToken]=useState(localStorage.remindToken||'')
  const [data,setData]=useState<Dashboard>(demo)
  const [tab,setTab]=useState('Overview')
  const [drawer,setDrawer]=useState(false)
  const [rebuilding,setRebuilding]=useState(false)
  const [notice,setNotice]=useState<string|null>(null)
  const [selectedConceptId,setSelectedConceptId]=useState<number|null>(null)
  const file=useRef<HTMLInputElement>(null)

  const headers=()=>({Authorization:`Bearer ${token}`})

  const load=async()=>{
    if(!token)return
    try {
      const r=await fetch(API+'/dashboard',{headers:headers()})
      if(r.ok)setData(await r.json())
    }catch{}
  }

  useEffect(()=>{load()},[token])

  const rebuild=async()=>{
    if(!token||rebuilding)return
    setRebuilding(true)
    try {
      const r=await fetch(API+'/revisions/rebuild',{method:'POST',headers:headers()})
      if(r.ok){
        const body=await r.json()
        await load()
        setNotice(body.message||'Recommendations refreshed successfully.')
        setTimeout(()=>setNotice(null),4500)
      } else {
        const err=await r.json().catch(()=>({}))
        alert(err.detail||'Could not refresh recommendations.')
      }
    } catch {
      alert('Could not connect to backend server.')
    } finally {
      setRebuilding(false)
    }
  }

  const startAssessmentForConcept=(cid:number)=>{
    setSelectedConceptId(cid)
    setTab('Assessments')
  }

  const authenticate=async(email:string,password:string,mode:'login'|'register')=>{
    const r=await fetch(API+`/auth/${mode==='login'?'login':'register'}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})})
    const body=await r.json()
    if(!r.ok)throw new Error(body.detail||'Could not sign in.')
    localStorage.remindToken=body.access_token
    setToken(body.access_token)
  }

  const upload=async(e:React.ChangeEvent<HTMLInputElement>)=>{
    let f=e.target.files?.[0]
    if(!f||!token)return
    let form=new FormData()
    form.append('file',f)
    let r=await fetch(API+'/documents',{method:'POST',headers:headers(),body:form})
    if(r.ok){
      await load()
      alert('Document processed and indexed.')
      await rebuild()
    } else alert((await r.json()).detail||'Upload failed')
  }

  const nav=['Overview','My Library','Knowledge Map','Assessments','Revision Center','Analytics']
  if(!token)return <LoginPage authenticate={authenticate}/>
  const shared={token,headers,refresh:load}

  return (
    <div className="app">
      <aside className={drawer?'open':''}>
        <div className="brand"><span>r</span> ReMind</div>
        <div className="workspace">
          <span className="avatar">U</span>
          <div><b>Your workspace</b><small>Personal learning</small></div>
          <MoreHorizontal size={17}/>
        </div>
        <nav>
          {nav.map((n,i)=>{
            const I=[Grid2X2,Library,BrainCircuit,BookOpen,Target,ChartNoAxesCombined][i]
            return (
              <button key={n} className={tab===n?'selected':''} onClick={()=>{setTab(n);setDrawer(false)}}>
                <I size={18}/>
                {n}
                {n==='Revision Center'&&data.recommendations.length>0?<em>{data.recommendations.length}</em>:null}
              </button>
            )
          })}
        </nav>
        <div className="side-foot">
          <button><Clock3 size={17}/>Study history</button>
          <button onClick={()=>{localStorage.removeItem('remindToken');setToken('')}}>Sign out</button>
        </div>
      </aside>

      <main className="content">
        <header>
          <button className="mobile-menu" onClick={()=>setDrawer(true)}><Menu/></button>
          <div>
            <p className="eyebrow">LOCAL-FIRST LEARNING</p>
            <h2>{tab==='Overview'?'A gentler way to keep up.':tab}</h2>
          </div>
          <button className="upload" onClick={()=>file.current?.click()}><Plus size={17}/>Add material</button>
          <input ref={file} onChange={upload} type="file" accept=".pdf,.docx,.txt,.md" hidden/>
        </header>

        {tab==='Overview' ? (
          <Overview
            d={data}
            upload={()=>file.current?.click()}
            rebuild={rebuild}
            rebuilding={rebuilding}
            notice={notice}
            onStartAssessment={startAssessmentForConcept}
          />
        ) : tab==='My Library' ? (
          <LibraryPage {...shared}/>
        ) : tab==='Knowledge Map' ? (
          <GraphPage {...shared}/>
        ) : tab==='Assessments' ? (
          <AssessmentsPage {...shared} initialConceptId={selectedConceptId}/>
        ) : tab==='Revision Center' ? (
          <RevisionCenterPage {...shared} onStartAssessment={startAssessmentForConcept}/>
        ) : tab==='Analytics' ? (
          <AnalyticsPage {...shared}/>
        ) : (
          <Empty tab={tab} upload={()=>file.current?.click()}/>
        )}
      </main>
    </div>
  )
}

function LoginPage({authenticate}:{authenticate:(email:string,password:string,mode:'login'|'register')=>Promise<void>}){
  const [mode,setMode]=useState<'login'|'register'>('login')
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)

  const submit=async(e:React.FormEvent)=>{
    e.preventDefault()
    setError('')
    if(!email.includes('@'))return setError('Enter a valid email address.')
    if(password.length<8)return setError('Password must be at least 8 characters.')
    setBusy(true)
    try{await authenticate(email,password,mode)}
    catch(err){setError(err instanceof Error?err.message:'Unable to continue.')}
    finally{setBusy(false)}
  }

  return (
    <main className="auth-page">
      <div className="gate-orb"></div>
      <section className="auth-copy">
        <div className="logo"><span>r</span> ReMind</div>
        <p className="eyebrow">THE PERSONAL LEARNING SYSTEM</p>
        <h1>Make your knowledge<br/><i>stay with you.</i></h1>
        <p className="lead">A private study space that brings the right ideas back at the right moment.</p>
        <p className="fine">Private by design · Local AI · Your material stays yours</p>
      </section>
      <section className="auth-card">
        <p className="eyebrow">WELCOME TO REMIND</p>
        <h2>{mode==='login'?'Welcome back.':'Create your learning space.'}</h2>
        <p>{mode==='login'?'Sign in to return to your material and learning rhythm.':'Use your email and a new password to begin.'}</p>
        <form onSubmit={submit}>
          <label>Email address
            <input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required/>
          </label>
          <label>Password
            <input type="password" autoComplete={mode==='login'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters" minLength={8} required/>
          </label>
          {error&&<div className="form-error" role="alert">{error}</div>}
          <button className="dark-btn auth-submit" disabled={busy}>
            {busy?'Please wait…':mode==='login'?'Sign in':'Create account'} <ChevronRight size={16}/>
          </button>
        </form>
        <button className="auth-switch" onClick={()=>{setMode(mode==='login'?'register':'login');setError('')}}>
          {mode==='login'?'New here? Create an account':'Already have an account? Sign in'}
        </button>
      </section>
    </main>
  )
}

function LibraryPage({headers,refresh}:{headers:()=>Record<string,string>,refresh:()=>Promise<void>}){
  const [docs,setDocs]=useState<any[]>([])
  const [message,setMessage]=useState('')

  const load=async()=>{
    let r=await fetch(API+'/documents',{headers:headers()})
    if(r.ok)setDocs(await r.json())
  }
  useEffect(()=>{load()},[])

  const action=async(id:number,path:string)=>{
    setMessage('Working with local AI…')
    let r=await fetch(`${API}/documents/${id}/${path}`,{method:'POST',headers:headers()})
    let b=await r.json()
    setMessage(r.ok?`${path==='retry'?'Indexed':`Added ${b.concepts_added||0} concepts`} successfully.`:b.detail||'Action failed. Start Ollama and try again.')
    await load()
    await refresh()
  }

  return (
    <section className="panel data-page">
      <p className="eyebrow">YOUR SOURCES</p>
      <h3>Document library</h3>
      {message&&<p className="notice">{message}</p>}
      {docs.length?docs.map(d=>(
        <article key={d.id} className="data-row">
          <div>
            <b>{d.name}</b>
            <p>Status: <span className="status">{d.status}</span></p>
          </div>
          <div className="row-actions">
            {d.status!=='indexed'&&<button onClick={()=>action(d.id,'retry')}>Index with Ollama</button>}
            <button onClick={()=>action(d.id,'extract-concepts')}>Extract concepts</button>
          </div>
        </article>
      )):(
        <div className="empty">
          <b>No study materials yet</b>
          <p>Upload a document to extract passages, embeddings, and concepts.</p>
        </div>
      )}
    </section>
  )
}

function GraphPage({headers}:{headers:()=>Record<string,string>}){
  const [graph,setGraph]=useState<{nodes:any[],edges:any[]}>({nodes:[],edges:[]})
  useEffect(()=>{
    fetch(API+'/knowledge-graph',{headers:headers()}).then(r=>r.ok?r.json():null).then(x=>x&&setGraph(x))
  },[])

  return (
    <section className="panel data-page">
      <p className="eyebrow">SOURCE-GROUNDED STRUCTURE</p>
      <h3>Knowledge map</h3>
      {graph.nodes.length?<>
        <div className="graph-list">
          {graph.nodes.map(n=>(
            <article key={n.id}>
              <span className={n.assessed?'node assessed':'node'}></span>
              <div>
                <b>{n.label}</b>
                <p>{n.topic} · {n.assessed?`risk ${n.risk??'unknown'}%`:'Not assessed'}</p>
              </div>
            </article>
          ))}
        </div>
        <p className="fine">{graph.edges.length} evidence-backed relationship{graph.edges.length===1?'':'s'} stored.</p>
      </>:(
        <div className="empty">
          <b>No concepts to map</b>
          <p>Upload material, then choose “Extract concepts” in My Library while Ollama is running.</p>
        </div>
      )}
    </section>
  )
}

function AnalyticsPage({headers}:{headers:()=>Record<string,string>}){
  const [stats,setStats]=useState<any>()
  useEffect(()=>{
    fetch(API+'/analytics',{headers:headers()}).then(r=>r.ok?r.json():null).then(setStats)
  },[])

  return (
    <section className="panel data-page">
      <p className="eyebrow">RECORDED EVIDENCE</p>
      <h3>Learning analytics</h3>
      {stats?(
        <div className="stats">
          <Stat label="Answer attempts" value={stats.sample_size} note="Recorded submissions" icon={<BookOpen/>}/>
          <Stat label="Accuracy" value={stats.accuracy===null?'—':`${Math.round(stats.accuracy*100)}%`} note="Observed, not predicted" icon={<Target/>}/>
          <Stat label="Revision completion" value={stats.revision_completion_rate===null?'—':`${Math.round(stats.revision_completion_rate*100)}%`} note="Completed recommendations" icon={<Clock3/>}/>
        </div>
      ):(
        <div className="empty"><b>Loading recorded metrics…</b></div>
      )}
    </section>
  )
}

function RevisionCenterPage({
  headers,
  refresh,
  onStartAssessment
}:{
  headers:()=>Record<string,string>,
  refresh:()=>Promise<void>,
  onStartAssessment:(id:number)=>void
}){
  const [revisions,setRevisions]=useState<any[]>([])
  const [busy,setBusy]=useState(false)
  const [msg,setMsg]=useState('')

  const load=async()=>{
    try {
      const r=await fetch(API+'/revisions',{headers:headers()})
      if(r.ok)setRevisions(await r.json())
    }catch{}
  }
  useEffect(()=>{load()},[])

  const updateStatus=async(id:number,status:string)=>{
    try {
      const r=await fetch(`${API}/revisions/${id}`,{
        method:'PATCH',
        headers:{...headers(),'Content-Type':'application/json'},
        body:JSON.stringify({status})
      })
      if(r.ok){
        await load()
        await refresh()
      }
    }catch{}
  }

  const recalculate=async()=>{
    setBusy(true)
    setMsg('Recalculating revision queue…')
    try {
      const r=await fetch(API+'/revisions/rebuild',{method:'POST',headers:headers()})
      const data=await r.json()
      setMsg(data.message||'Revision recommendations updated.')
      await load()
      await refresh()
    }catch{
      setMsg('Failed to recalculate.')
    }finally{
      setBusy(false)
    }
  }

  return (
    <section className="panel data-page">
      <div className="panel-head">
        <div>
          <p className="eyebrow">TARGETED RETENTION</p>
          <h3>Revision Center</h3>
        </div>
        <button onClick={recalculate} disabled={busy}>
          {busy?<><RotateCw size={13} className="spin"/> Recalculating…</>:'Recalculate queue'}
        </button>
      </div>
      {msg&&<p className="notice">{msg}</p>}
      {revisions.length ? (
        revisions.map(r => (
          <article key={r.id} className="data-row">
            <div>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <b>{r.concept}</b>
                <span className={`badge ${r.status}`}>{r.status}</span>
                <span className="priority" style={{display:'inline-grid',width:22,height:22,fontSize:10}}>{r.priority}</span>
              </div>
              <p>{r.reason}</p>
            </div>
            <div className="row-actions">
              {r.status!=='completed'&&<button onClick={()=>onStartAssessment(r.concept_id)}>Take recall check</button>}
              {r.status!=='completed'&&<button onClick={()=>updateStatus(r.id,'completed')}>Mark complete</button>}
              {r.status==='recommended'&&<button onClick={()=>updateStatus(r.id,'snoozed')}>Snooze</button>}
            </div>
          </article>
        ))
      ) : (
        <div className="empty">
          <span><Clock3 size={23}/></span>
          <b>Revision queue is clear</b>
          <p>No revision items currently scheduled. Click "Recalculate queue" or upload study materials to start.</p>
        </div>
      )}
    </section>
  )
}

function AssessmentsPage({
  headers,
  refresh,
  initialConceptId
}:{
  headers:()=>Record<string,string>,
  refresh:()=>Promise<void>,
  initialConceptId?:number|null
}){
  const [concepts,setConcepts]=useState<any[]>([])
  const [selectedId,setSelectedId]=useState<number|null>(initialConceptId||null)
  const [assessment,setAssessment]=useState<any>(null)
  const [responses,setResponses]=useState<Record<number,string>>({})
  const [results,setResults]=useState<Record<number,any>>({})
  const [loading,setLoading]=useState(false)
  const [submitting,setSubmitting]=useState<number|null>(null)
  const [message,setMessage]=useState('')

  useEffect(()=>{
    fetch(API+'/concepts',{headers:headers()})
      .then(r=>r.ok?r.json():[])
      .then(list=>{
        setConcepts(list)
        if(!selectedId && list.length>0) setSelectedId(list[0].id)
      })
  },[])

  useEffect(()=>{
    if(initialConceptId) setSelectedId(initialConceptId)
  },[initialConceptId])

  const generateAssessment=async()=>{
    if(!selectedId) return
    setLoading(true)
    setMessage('Generating questions with local Ollama…')
    setAssessment(null)
    setResponses({})
    setResults({})
    try {
      const r=await fetch(API+'/assessments',{
        method:'POST',
        headers:{...headers(),'Content-Type':'application/json'},
        body:JSON.stringify({concept_id:selectedId,question_count:3,difficulty:'medium'})
      })
      const data=await r.json()
      if(r.ok){
        const detailRes=await fetch(`${API}/assessments/${data.id}`,{headers:headers()})
        if(detailRes.ok) setAssessment(await detailRes.json())
        else setAssessment(data)
        setMessage('')
      } else {
        setMessage(data.detail||'Failed to generate questions. Ensure Ollama is running.')
      }
    } catch {
      setMessage('Network error communicating with Ollama service.')
    } finally {
      setLoading(false)
    }
  }

  const submitAnswer=async(questionId:number)=>{
    const resp=responses[questionId]
    if(!resp) return
    setSubmitting(questionId)
    try {
      const r=await fetch(`${API}/questions/${questionId}/answer`,{
        method:'POST',
        headers:{...headers(),'Content-Type':'application/json'},
        body:JSON.stringify({response:resp})
      })
      const data=await r.json()
      if(r.ok){
        setResults(prev=>({...prev,[questionId]:data}))
        await refresh()
      } else {
        alert(data.detail||'Grading failed.')
      }
    } catch {
      alert('Could not submit answer.')
    } finally {
      setSubmitting(null)
    }
  }

  const currentConcept = concepts.find(c => c.id === selectedId)

  return (
    <section className="panel data-page">
      <p className="eyebrow">EVIDENCE-BASED RECALL</p>
      <h3>Concept Assessments</h3>
      {message && <p className="notice">{message}</p>}
      
      {concepts.length ? (
        <div>
          <div style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap',marginBottom:20}}>
            <label style={{fontSize:12,fontWeight:700,display:'flex',gap:8,alignItems:'center'}}>
              Target concept:
              <select
                value={selectedId||''}
                onChange={e=>setSelectedId(Number(e.target.value))}
                style={{padding:'7px 10px',borderRadius:8,border:'1px solid #dce4da',fontFamily:'inherit',fontSize:13}}
              >
                {concepts.map(c=>(
                  <option key={c.id} value={c.id}>{c.name} ({c.topic})</option>
                ))}
              </select>
            </label>
            <button className="dark-btn" onClick={generateAssessment} disabled={loading||!selectedId}>
              {loading ? <><RotateCw size={14} className="spin"/> Generating with local AI…</> : <><Target size={14}/> Generate recall check</>}
            </button>
          </div>

          {currentConcept && (
            <div style={{background:'#fafbfa',border:'1px solid #edf0eb',borderRadius:10,padding:12,marginBottom:16,fontSize:12}}>
              <b>{currentConcept.name}</b> · Topic: {currentConcept.topic} · Recorded attempts: {currentConcept.attempts} · Decay risk: {currentConcept.decay_risk !== null ? `${currentConcept.decay_risk}%` : 'Unassessed'}
            </div>
          )}

          {assessment && (
            <div>
              <p className="eyebrow" style={{marginBottom:10}}>{assessment.title.toUpperCase()}</p>
              {assessment.questions?.map((q:any, i:number)=>{
                const res = results[q.id]
                return (
                  <div key={q.id} className="question-card">
                    <p style={{fontSize:13,fontWeight:700,marginBottom:8}}>Question {i+1} ({q.kind.replace('_',' ')}):</p>
                    <p style={{fontSize:13,lineHeight:1.6}}>{q.prompt}</p>

                    {q.kind === 'multiple_choice' && (
                      <div className="question-options">
                        {q.options?.map((opt:string, oi:number)=>(
                          <button
                            key={oi}
                            type="button"
                            className={`question-option ${responses[q.id]===opt?'selected':''}`}
                            onClick={()=>!res && setResponses(p=>({...p,[q.id]:opt}))}
                            disabled={!!res}
                          >
                            <span>{String.fromCharCode(65+oi)}.</span> {opt}
                          </button>
                        ))}
                      </div>
                    )}

                    {q.kind === 'true_false' && (
                      <div className="question-options" style={{gridTemplateColumns:'1fr 1fr'}}>
                        {['True','False'].map(opt=>(
                          <button
                            key={opt}
                            type="button"
                            className={`question-option ${responses[q.id]===opt?'selected':''}`}
                            onClick={()=>!res && setResponses(p=>({...p,[q.id]:opt}))}
                            disabled={!!res}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    )}

                    {q.kind === 'short_answer' && (
                      <textarea
                        className="answer-box"
                        placeholder="Type your answer grounded in your study material…"
                        value={responses[q.id]||''}
                        onChange={e=>!res && setResponses(p=>({...p,[q.id]:e.target.value}))}
                        disabled={!!res}
                      />
                    )}

                    {!res ? (
                      <button
                        className="dark-btn"
                        style={{marginTop:8}}
                        onClick={()=>submitAnswer(q.id)}
                        disabled={!responses[q.id] || submitting === q.id}
                      >
                        {submitting === q.id ? 'Grading…' : 'Submit response'}
                      </button>
                    ) : (
                      <div className={`feedback-box ${res.correct ? 'correct' : 'incorrect'}`}>
                        <b>{res.correct ? '✓ Correct' : '✕ Needs Review'} (Score: {res.score}/1)</b>
                        <p style={{marginTop:4}}>{res.feedback}</p>
                        {res.decay_risk !== undefined && (
                          <small style={{display:'block',marginTop:4,opacity:0.8}}>Updated concept decay risk: {res.decay_risk}%</small>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="empty">
          <b>No concepts available</b>
          <p>Upload study material in My Library to generate concepts for assessment.</p>
        </div>
      )}
    </section>
  )
}

function Overview({
  d,
  rebuild,
  rebuilding,
  notice,
  upload,
  onStartAssessment
}:{
  d:Dashboard,
  rebuild:()=>void,
  rebuilding:boolean,
  notice:string|null,
  upload:()=>void,
  onStartAssessment:(conceptId:number)=>void
}){
  const total=d.documents
  return (
    <>
      <section className="hero">
        <div>
          <span className="pill"><Sparkles size={14}/> YOUR LEARNING RHYTHM</span>
          <h1>
            {d.at_risk ? (
              <>You have <i>{d.at_risk} {d.at_risk===1?'idea':'ideas'}</i><br/>asking for attention.</>
            ) : (
              <>Let’s build your<br/><i>knowledge rhythm.</i></>
            )}
          </h1>
          <p>
            {total
              ? `You have ${d.processed_documents} processed resource${d.processed_documents===1?'':'s'} ready to support your next review.`
              : 'Add your first study resource. ReMind will organize it into a learning map—without pretending you know it yet.'
            }
          </p>
          {notice && <p className="notice" style={{background:'#ffffffb0',marginBottom:16,border:'1px solid #c9dec2'}}>{notice}</p>}
          {total ? (
            <button className="light-btn" onClick={rebuild} disabled={rebuilding}>
              {rebuilding ? (
                <><RotateCw size={15} className="spin"/> Refreshing recommendations…</>
              ) : (
                <>Refresh recommendations <ChevronRight size={16}/></>
              )}
            </button>
          ) : (
            <button className="light-btn" onClick={upload}>
              <FileUp size={16}/> Upload study material
            </button>
          )}
        </div>
        <div className="hero-art">
          <div className="orbit one"></div>
          <div className="orbit two"></div>
          <div className="brain"><BrainCircuit size={48}/></div>
          <span className="dot d1"></span>
          <span className="dot d2"></span>
          <span className="dot d3"></span>
        </div>
      </section>

      <section className="stats">
        <Stat label="Study materials" value={d.documents} note={`${d.processed_documents} indexed`} icon={<Library/>}/>
        <Stat label="Concepts found" value={d.concepts} note={d.concepts?'Awaiting assessment':'Upload material to begin'} icon={<BrainCircuit/>}/>
        <Stat label="Assessed" value={d.assessed_concepts} note="Evidence-based only" icon={<Target/>}/>
        <Stat label="Needs attention" value={d.at_risk} note="From recall history" icon={<Clock3/>}/>
      </section>

      <section className="lower">
        <div className="panel focus">
          <div className="panel-head">
            <div>
              <p className="eyebrow">NEXT UP</p>
              <h3>Your revision queue</h3>
            </div>
            <button onClick={rebuild} disabled={rebuilding}>
              {rebuilding ? <><RotateCw size={12} className="spin"/> Recalculating…</> : 'Recalculate'}
            </button>
          </div>
          {d.recommendations.length ? (
            <div className="queue">
              {d.recommendations.slice(0, 4).map(x => (
                <article
                  key={x.id}
                  className="queue-item"
                  onClick={()=>onStartAssessment(x.concept_id)}
                  title="Click to start recall check"
                >
                  <div className="priority">{x.priority}</div>
                  <div>
                    <b>{x.concept}</b>
                    <p>{x.reason}</p>
                  </div>
                  <span>{x.activity}</span>
                  <ChevronRight size={18}/>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty">
              <span><Target size={23}/></span>
              <b>No review is due yet</b>
              <p>Assessment evidence is needed before ReMind can estimate retention and make recommendations.</p>
            </div>
          )}
        </div>

        <div className="panel insights">
          <p className="eyebrow">LEARNING SIGNALS</p>
          <h3>Built from evidence,<br/>not guesses.</h3>
          <div className="signal">
            <div className="bar">
              <i style={{height:'24%'}}></i>
              <i style={{height:'48%'}}></i>
              <i style={{height:'32%'}}></i>
              <i style={{height:'65%'}}></i>
              <i style={{height:'42%'}}></i>
            </div>
            <small>Your retention trend will appear after completed assessments.</small>
          </div>
        </div>
      </section>
    </>
  )
}

function Stat({label,value,note,icon}:{label:string;value:number|string;note:string;icon:any}){
  return (
    <article className="stat">
      <span>{icon}</span>
      <p>{label}</p>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function Empty({tab,upload}:{tab:string;upload:()=>void}){
  return (
    <section className="page-empty">
      <div><BookOpen size={34}/></div>
      <p className="eyebrow">{tab.toUpperCase()}</p>
      <h1>Your {tab.toLowerCase()} starts<br/><i>with your material.</i></h1>
      <p>Add a PDF, DOCX, Markdown, or text file to build your private learning workspace.</p>
      <button className="dark-btn" onClick={upload}>Add study material <ChevronRight size={16}/></button>
    </section>
  )
}

function Root(){return <ErrorBoundary><App/></ErrorBoundary>}

const container=document.getElementById('root')
if (!container) throw new Error('ReMind could not find its root element.')
createRoot(container).render(<Root />)
