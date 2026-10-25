import { Component, ReactNode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AlertCircle, AlertTriangle, ArrowUp, BookOpen, BrainCircuit, ChartNoAxesCombined, CheckCircle2, ChevronDown, ChevronRight, Clock3, Copy, FileUp, Grid2X2, HardDrive, Library, Lock, Menu, MessageCircle, Moon, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Pencil, Plus, RotateCw, Settings, Shield, Sparkles, Sun, Target, Trash2, User, X } from 'lucide-react'
import './styles.css'

const API = '/api/v1'
type UserProfile = {
  id: number
  email: string
  display_name?: string
  workspace_name?: string
  created_at?: string | null
}
type LearningSignals = {
  total_assessments: number
  correct_answers: number
  total_questions: number
  accuracy: number | null
  retention_rate: number | null
  recent: { score: number; max_score: number; height: number; correct: boolean; date: string }[]
}

type Dashboard = {
  documents: number
  processed_documents: number
  concepts: number
  assessed_concepts: number
  at_risk: number
  recommendations: any[]
  signals?: LearningSignals
}
const demo: Dashboard = { documents: 0, processed_documents: 0, concepts: 0, assessed_concepts: 0, at_risk: 0, recommendations: [] }

class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false }; static getDerivedStateFromError() { return { error: true } }
  render() { return this.state.error ? <main className="gate"><div className="logo"><img src="/icon.png" alt="ReMind" className="brand-logo" /> ReMind</div><h1>Something prevented<br /><i>the interface from loading.</i></h1><p className="lead">Please refresh this page. If it persists, start the frontend with <code>npm run dev</code> from the frontend folder.</p></main> : this.props.children }
}

type FontScale = 'sm' | 'md' | 'lg' | 'xl'
type AppAlertState = {
  title: string
  message: string
  tone: 'confirm' | 'success' | 'error' | 'info'
  confirmLabel?: string
  onConfirm?: () => void
}

function applyTheme(theme: 'light' | 'dark') { document.documentElement.setAttribute('data-theme', theme) }
function applyScale(scale: FontScale) { document.documentElement.setAttribute('data-fscale', scale) }

function App() {
  const [token, setToken] = useState(localStorage.remindToken || '')
  const [user, setUser] = useState<UserProfile | null>(null)
  const [data, setData] = useState<Dashboard>(demo)
  const [tab, setTab] = useState('Overview')
  const [chatSessionKey, setChatSessionKey] = useState(0)
  const [drawer, setDrawer] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [rebuilding, setRebuilding] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [appAlert, setAppAlert] = useState<AppAlertState | null>(null)
  const [assessmentToOpenId, setAssessmentToOpenId] = useState<number | null>(null)
  const [selectedConceptId, setSelectedConceptId] = useState<number | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [profileModalOpen, setProfileModalOpen] = useState(false)
  const [profileModalTab, setProfileModalTab] = useState<'profile' | 'workspace' | 'stats' | 'security'>('profile')
  const [documentsRefreshKey, setDocumentsRefreshKey] = useState(0)
  const [uploadStatus, setUploadStatus] = useState<{ state: 'uploading' | 'success' | 'error' | 'info'; title: string; message: string } | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>((localStorage.remindTheme || 'light') as 'light' | 'dark')
  const [fscale, setFscale] = useState<FontScale>((localStorage.remindScale || 'md') as FontScale)
  const file = useRef<HTMLInputElement>(null)
  const workspaceRef = useRef<HTMLDivElement>(null)
  const settingsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!uploadStatus || uploadStatus.state === 'uploading' || uploadStatus.state === 'info') return
    const timeout = window.setTimeout(() => setUploadStatus(null), 5000)
    return () => window.clearTimeout(timeout)
  }, [uploadStatus])

  // Apply theme + scale on mount and change
  useEffect(() => { applyTheme(theme); localStorage.remindTheme = theme }, [theme])
  useEffect(() => { applyScale(fscale); localStorage.remindScale = fscale }, [fscale])
  useEffect(() => {
    if (!token || !('Notification' in window) || Notification.permission !== 'default') return
    if (localStorage.remindNotificationPermissionAsked === 'true') return
    localStorage.remindNotificationPermissionAsked = 'true'
    void Notification.requestPermission()
  }, [token])
  useEffect(() => {
    if (!appAlert || !['Assessment ready', 'Assistant response ready'].includes(appAlert.title) || !document.hidden) return
    const originalTitle = document.title
    let showAlertTitle = true
    const interval = window.setInterval(() => {
      document.title = showAlertTitle ? `${appAlert.title} · ReMind` : originalTitle
      showAlertTitle = !showAlertTitle
    }, 1200)
    const restoreTitle = () => { document.title = originalTitle }
    document.addEventListener('visibilitychange', restoreTitle, { once: true })
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', restoreTitle)
      document.title = originalTitle
    }
  }, [appAlert])

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light')
  const openFreshAssistant = () => {
    setAppAlert(null)
    setChatSessionKey(key => key + 1)
    setTab('AI Study Assistant')
    setDrawer(false)
  }

  const headers = () => ({ Authorization: `Bearer ${token}` })

  const load = async () => {
    if (!token) return
    try {
      const r = await fetch(API + '/dashboard', { headers: headers() })
      if (r.ok) setData(await r.json())
    } catch { }
  }

  const loadUser = async () => {
    if (!token) return
    try {
      const r = await fetch(API + '/auth/me', { headers: headers() })
      if (r.ok) setUser(await r.json())
    } catch { }
  }

  useEffect(() => {
    load()
    loadUser()
  }, [token])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (workspaceRef.current && !workspaceRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false)
      }
    }
    if (profileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [profileMenuOpen])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false)
      }
    }
    if (settingsOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [settingsOpen])

  const handleSignOut = () => {
    localStorage.removeItem('remindToken')
    setToken('')
    setUser(null)
    setProfileMenuOpen(false)
    setProfileModalOpen(false)
  }

  const rebuild = async (notify = true) => {
    if (!token || rebuilding) return
    setRebuilding(true)
    try {
      const r = await fetch(API + '/revisions/rebuild', { method: 'POST', headers: headers() })
      if (r.ok) {
        const body = await r.json()
        await load()
        if (notify) setAppAlert({ title: 'Revision queue updated', message: body.message || 'Your revision recommendations are up to date.', tone: 'success' })
      } else {
        const err = await r.json().catch(() => ({}))
        if (notify) setAppAlert({ title: 'Revision queue update failed', message: err.detail || 'Revision recommendations could not be recalculated. Please try again.', tone: 'error' })
      }
    } catch {
      if (notify) setAppAlert({ title: 'Revision queue update failed', message: 'Could not connect to update revision recommendations. Please try again.', tone: 'error' })
    } finally {
      setRebuilding(false)
    }
  }

  const startAssessmentForConcept = (cid: number) => {
    setSelectedConceptId(cid)
    setAssessmentToOpenId(null)
    localStorage.removeItem('remindPendingAssessmentId')
    setTab('Assessments')
  }

  const authenticate = async (email: string, password: string, mode: 'login' | 'register') => {
    let r: Response
    try {
      r = await fetch(API + `/auth/${mode === 'login' ? 'login' : 'register'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
    } catch {
      throw new Error('Could not connect to the backend server. Please verify it is running on port 8000.')
    }
    const body = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(body.detail || `Server error (${r.status}). Please check backend service.`)
    localStorage.remindToken = body.access_token
    setToken(body.access_token)
    if (body.user) setUser(body.user)
  }

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f || !token) return
    const form = new FormData()
    form.append('file', f)
    setUploadStatus({ state: 'uploading', title: 'Uploading study material', message: `Uploading "${f.name}"…` })
    try {
      const r = await fetch(API + '/documents', { method: 'POST', headers: headers(), body: form })
      if (r.ok) {
        const result = await r.json()
        setDocumentsRefreshKey(key => key + 1)
        await load()
        setUploadStatus({ state: 'success', title: 'Upload complete', message: `"${f.name}" uploaded successfully.` })
        e.target.value = ''
        setAppAlert({
          title: 'Study material uploaded',
          message: `"${f.name}" is ready. Would you like ReMind to extract concepts from it now?`,
          tone: 'confirm',
          confirmLabel: 'Extract concepts',
          onConfirm: () => {
            setUploadStatus({ state: 'info', title: 'Extracting concepts', message: 'ReMind is reading your material and building your knowledge map…' })
            fetch(`${API}/documents/${result.id}/extract-concepts`, { method: 'POST', headers: headers() })
              .then(async extraction => {
                const extractionResult = await extraction.json()
                if (!extraction.ok) throw new Error(extractionResult.detail || 'Concept extraction failed. You can try again from My Library.')
                setUploadStatus({ state: 'success', title: 'Extraction complete', message: `Added ${extractionResult.concepts_added || 0} concepts to your knowledge map.` })
                await load()
                setDocumentsRefreshKey(key => key + 1)
                void rebuild(false)
              })
              .catch(error => setUploadStatus({
                state: 'error',
                title: 'Extraction failed',
                message: error instanceof Error ? error.message : 'Could not connect to the server. You can try again from My Library.'
              }))
          }
        })
      } else {
        const error = await r.json().catch(() => ({}))
        setUploadStatus({ state: 'error', title: 'Upload failed', message: error.detail || 'The file could not be uploaded.' })
        e.target.value = ''
      }
    } catch {
      setUploadStatus({ state: 'error', title: 'Upload failed', message: 'Could not connect to the server. Please try again.' })
      e.target.value = ''
    }
  }

  const nav = ['Overview', 'My Library', 'Knowledge Map', 'AI Study Assistant', 'Assessments', 'Revision Center', 'Analytics']
  if (!token) return <LoginPage authenticate={authenticate} />
  const shared = { token, headers, refresh: load, documentsRefreshKey }

  const scaleLabels: FontScale[] = ['sm', 'md', 'lg', 'xl']
  const scaleFull: { [k in FontScale]: string } = { sm: 'Small', md: 'Default', lg: 'Large', xl: 'X-Large' }

  return (
    <div className={`app${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <aside className={`${drawer ? 'open ' : ''}${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="brand"><img src="/icon.png" alt="ReMind" className="brand-logo" /><b>ReMind</b></div>
        <button
          className="sidebar-toggle"
          onClick={() => setSidebarCollapsed(collapsed => !collapsed)}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
        <div className="workspace-container" ref={workspaceRef}>
          <button
            className={`workspace ${profileMenuOpen ? 'active' : ''}`}
            onClick={() => setProfileMenuOpen(o => !o)}
            aria-expanded={profileMenuOpen}
            aria-haspopup="true"
            title="User Profile & Personal Workspace Options"
          >
            <span className="avatar">
              {user?.display_name ? user.display_name[0].toUpperCase() : (user?.email ? user.email[0].toUpperCase() : 'U')}
            </span>
            <div className="workspace-info">
              <b className="workspace-title">{user?.workspace_name || 'Your workspace'}</b>
              <small>{user?.display_name || user?.email?.split('@')[0] || 'Personal learning'}</small>
            </div>
            <MoreHorizontal size={17} />
          </button>

          {profileMenuOpen && (
            <div className="workspace-dropdown" role="menu">
              <div className="workspace-dropdown-header">
                <div className="workspace-dropdown-user">{user?.display_name || user?.email?.split('@')[0] || 'User Profile'}</div>
                <div className="workspace-dropdown-email">{user?.email || 'Local user'}</div>
                <div className="workspace-dropdown-badge">{user?.workspace_name || 'Personal Workspace'}</div>
              </div>
              <div className="workspace-dropdown-menu">
                <button
                  className="workspace-dropdown-item"
                  onClick={() => { setProfileModalTab('profile'); setProfileModalOpen(true); setProfileMenuOpen(false); }}
                >
                  <User size={15} />
                  Profile & Account
                </button>
                <button
                  className="workspace-dropdown-item"
                  onClick={() => { setProfileModalTab('workspace'); setProfileModalOpen(true); setProfileMenuOpen(false); }}
                >
                  <HardDrive size={15} />
                  Workspace Settings
                </button>
                <button
                  className="workspace-dropdown-item"
                  onClick={() => { setProfileModalTab('stats'); setProfileModalOpen(true); setProfileMenuOpen(false); }}
                >
                  <ChartNoAxesCombined size={15} />
                  Learning Stats
                </button>
                <button
                  className="workspace-dropdown-item"
                  onClick={() => { setProfileModalTab('security'); setProfileModalOpen(true); setProfileMenuOpen(false); }}
                >
                  <Lock size={15} />
                  Security & Password
                </button>
                <div className="workspace-dropdown-divider" />
                <button
                  className="workspace-dropdown-item"
                  onClick={() => { setSettingsOpen(o => !o); setProfileMenuOpen(false); }}
                >
                  <Settings size={15} />
                  Appearance
                </button>
                <button
                  className="workspace-dropdown-item danger"
                  onClick={() => { setProfileModalTab('security'); setProfileModalOpen(true); setProfileMenuOpen(false); }}
                >
                  <Trash2 size={15} />
                  Delete Account...
                </button>
                <button
                  className="workspace-dropdown-item"
                  onClick={handleSignOut}
                >
                  <X size={15} />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
        <nav>
          {nav.map((n, i) => {
            const I = [Grid2X2, Library, BrainCircuit, MessageCircle, BookOpen, Target, ChartNoAxesCombined][i]
            return (
              <button key={n} className={tab === n ? 'selected' : ''} onClick={() => {
                setTab(n)
                if (n === 'AI Study Assistant') setChatSessionKey(key => key + 1)
                if (n === 'Assessments') {
                  setAppAlert(null)
                  const pendingId = Number(localStorage.remindPendingAssessmentId)
                  if (Number.isInteger(pendingId) && pendingId > 0) setAssessmentToOpenId(pendingId)
                }
                if (n !== 'Assessments') setAssessmentToOpenId(null)
                setDrawer(false)
                setSettingsOpen(false)
              }}>
                <I size={18} />
                <span>{n}</span>
                {n === 'Revision Center' && data.recommendations.length > 0 ? <em>{data.recommendations.length}</em> : null}
              </button>
            )
          })}
        </nav>
        <div className="side-foot">
          <button onClick={handleSignOut}>Sign out</button>
        </div>

        {settingsOpen && (
          <div className="settings-panel" ref={settingsRef}>
            {/* Theme toggle */}
            <p className="label">Theme</p>
            <div className="settings-row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-xs)', color: 'var(--text-aside-muted)' }}>
                {theme === 'dark' ? <Moon size={13} /> : <Sun size={13} />}
                {theme === 'dark' ? 'Dark' : 'Light'}
              </span>
              <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme" />
            </div>

            {/* Font size */}
            <div className="font-size-heading">
              <p className="label">Font size</p>
              <span>{scaleFull[fscale]}</span>
            </div>
            <div className="font-size-slider">
              <span className="font-size-mark small">A</span>
              <input
                type="range"
                min={0}
                max={scaleLabels.length - 1}
                step={1}
                value={scaleLabels.indexOf(fscale)}
                onChange={e => setFscale(scaleLabels[Number(e.target.value)])}
                aria-label="Font size"
                aria-valuetext={scaleFull[fscale]}
              />
              <span className="font-size-mark large">A</span>
            </div>
          </div>
        )}
      </aside>

      <main className="content">
        <header>
          <button className="mobile-menu" onClick={() => setDrawer(true)}><Menu size={22} /></button>
          <div>
            <p className="eyebrow">LOCAL-FIRST LEARNING</p>
            <h2>{tab === 'Overview' ? 'A gentler way to keep up.' : tab}</h2>
          </div>
          <div className="header-actions">
            <button className="assistant-header-btn" onClick={openFreshAssistant} title="Open AI Study Assistant">
              <MessageCircle size={17} /> <span>AI Assistant</span>
            </button>
            <button className="upload" onClick={() => file.current?.click()} disabled={uploadStatus?.state === 'uploading'}><Plus size={17} />{uploadStatus?.state === 'uploading' ? 'Uploading…' : 'Add material'}</button>
          </div>
          <input ref={file} onChange={upload} type="file" accept=".pdf,.docx,.txt,.md" hidden disabled={uploadStatus?.state === 'uploading'} />
        </header>
        {tab === 'Overview' ? (
          <Overview
            d={data}
            upload={() => file.current?.click()}
            rebuild={rebuild}
            rebuilding={rebuilding}
            notice={notice}
            onStartAssessment={startAssessmentForConcept}
          />
        ) : tab === 'My Library' ? (
          <LibraryPage {...shared} onWorkflowNotify={(toast) => setUploadStatus(toast)} />
        ) : tab === 'Knowledge Map' ? (
          <GraphPage {...shared} />
        ) : tab === 'AI Study Assistant' ? (
          <ChatPage key={chatSessionKey} token={token} headers={headers} onAlert={alert => setAppAlert(alert)} onOpenAssistant={openFreshAssistant} />
        ) : tab === 'Assessments' ? (
          <AssessmentsPage
            {...shared}
            initialConceptId={selectedConceptId}
            onAssessmentGenerated={(assessmentId) => {
              localStorage.remindPendingAssessmentId = String(assessmentId)
              const backgrounded = document.hidden
              if (tab === 'Assessments' && !backgrounded) {
                setAppAlert(null)
                return
              }
              if (backgrounded && 'Notification' in window && Notification.permission === 'granted') {
                new Notification('Assessment ready', { body: 'Your questions are ready to answer in ReMind.' })
              }
              setAppAlert({
                title: 'Assessment ready',
                message: 'Your assessment was generated successfully. Open the assessment section to start answering.',
                tone: 'success',
                confirmLabel: 'Open assessment',
                onConfirm: () => {
                  setAppAlert(null)
                  setAssessmentToOpenId(assessmentId)
                  localStorage.removeItem('remindPendingAssessmentId')
                  setTab('Assessments')
                  setDrawer(false)
                }
              })
            }}
            onCloseAssessment={() => setAssessmentToOpenId(null)}
            assessmentToOpenId={assessmentToOpenId}
          />
        ) : tab === 'Revision Center' ? (
          <RevisionCenterPage
            {...shared}
            onStartAssessment={startAssessmentForConcept}
            onNotify={(title, message, tone) => setAppAlert({ title, message, tone })}
          />
        ) : tab === 'Analytics' ? (
          <AnalyticsPage {...shared} onNotify={(title, message, tone) => setAppAlert({ title, message, tone })} />
        ) : (
          <Empty tab={tab} upload={() => file.current?.click()} />
        )}
      </main>

      <ProfileModal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        user={user}
        token={token}
        headers={headers}
        onUserUpdate={u => setUser(u)}
        initialTab={profileModalTab}
        dashboardData={data}
        onSignOut={handleSignOut}
        onNavigateTab={t => {
          setTab(t)
          if (t !== 'Assessments') setAssessmentToOpenId(null)
          setDrawer(false)
        }}
      />
      {appAlert && (
        <AppAlert
          {...appAlert}
          onClose={() => setAppAlert(null)}
        />
      )}
      {uploadStatus && (
        <WorkflowToast
          {...uploadStatus}
          onClose={() => setUploadStatus(null)}
        />
      )}
    </div>
  )
}

function AppAlert({
  title,
  message,
  tone,
  confirmLabel = 'Continue',
  onConfirm,
  onClose
}: AppAlertState & { onClose: () => void }) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && tone !== 'info') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, tone])

  const confirm = () => {
    if (onConfirm) onConfirm()
    onClose()
  }

  return (
    <div className="app-alert-backdrop" role="presentation">
      <section className={`app-alert ${tone}`} role="alertdialog" aria-modal="true" aria-labelledby="app-alert-title">
        <div className="app-alert-icon">
          {tone === 'confirm' && <Sparkles size={21} />}
          {tone === 'success' && <CheckCircle2 size={21} />}
          {tone === 'error' && <AlertCircle size={21} />}
          {tone === 'info' && <RotateCw size={21} className="spin" />}
        </div>
        <div className="app-alert-content">
          <h3 id="app-alert-title">{title}</h3>
          <p>{message}</p>
        </div>
        {tone !== 'info' && (
          <button className="app-alert-close" onClick={onClose} aria-label="Close alert">
            <X size={18} />
          </button>
        )}
        <div className="app-alert-actions">
          {tone === 'confirm' && <button className="light-btn" onClick={onClose}>Not now</button>}
          {tone === 'confirm' && <button className="dark-btn" onClick={confirm}>{confirmLabel}</button>}
          {tone !== 'confirm' && tone !== 'info' && (
            <button className="dark-btn" onClick={onConfirm ? confirm : onClose}>
              {onConfirm ? <>{confirmLabel} <ChevronRight size={15} /></> : 'Done'}
            </button>
          )}
        </div>
      </section>
    </div>
  )
}

function ProfileModal({
  isOpen,
  onClose,
  user,
  token: _token,
  headers,
  onUserUpdate,
  initialTab = 'profile',
  dashboardData,
  onSignOut,
  onNavigateTab,
}: {
  isOpen: boolean
  onClose: () => void
  user: UserProfile | null
  token: string
  headers: () => Record<string, string>
  onUserUpdate: (u: UserProfile) => void
  initialTab?: 'profile' | 'workspace' | 'stats' | 'security'
  dashboardData: Dashboard
  onSignOut: () => void
  onNavigateTab: (tab: string) => void
}) {
  const [tab, setTab] = useState<'profile' | 'workspace' | 'stats' | 'security'>(initialTab)
  const [displayName, setDisplayName] = useState(user?.display_name || '')
  const [workspaceName, setWorkspaceName] = useState(user?.workspace_name || 'Personal Workspace')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileNotice, setProfileNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordNotice, setPasswordNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteNotice, setDeleteNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [health, setHealth] = useState<any>(null)

  useEffect(() => {
    setTab(initialTab)
    setShowDeleteConfirm(false)
    setDeletePassword('')
    setDeleteNotice(null)
  }, [initialTab, isOpen])

  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name || '')
      setWorkspaceName(user.workspace_name || 'Personal Workspace')
    }
  }, [user])

  useEffect(() => {
    if (isOpen) {
      fetch(API + '/health')
        .then(r => r.json())
        .then(setHealth)
        .catch(() => { })
    }
  }, [isOpen])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
    }
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setProfileSaving(true)
    setProfileNotice(null)
    try {
      const r = await fetch(API + '/auth/profile', {
        method: 'PUT',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: displayName, workspace_name: workspaceName }),
      })
      const data = await r.json()
      if (r.ok) {
        onUserUpdate(data)
        setProfileNotice({ type: 'success', text: 'Profile and workspace updated successfully.' })
        setTimeout(() => setProfileNotice(null), 3500)
      } else {
        setProfileNotice({ type: 'error', text: data.detail || 'Could not update profile.' })
      }
    } catch {
      setProfileNotice({ type: 'error', text: 'Network error connecting to backend.' })
    } finally {
      setProfileSaving(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordNotice(null)
    if (newPassword.length < 8) {
      setPasswordNotice({ type: 'error', text: 'New password must be at least 8 characters long.' })
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordNotice({ type: 'error', text: 'New passwords do not match.' })
      return
    }
    setPasswordSaving(true)
    try {
      const r = await fetch(API + '/auth/change-password', {
        method: 'POST',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      })
      const data = await r.json()
      if (r.ok) {
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        setPasswordNotice({ type: 'success', text: data.message || 'Password changed successfully.' })
        setTimeout(() => setPasswordNotice(null), 4000)
      } else {
        setPasswordNotice({ type: 'error', text: data.detail || 'Password change failed.' })
      }
    } catch {
      setPasswordNotice({ type: 'error', text: 'Network error connecting to backend.' })
    } finally {
      setPasswordSaving(false)
    }
  }

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    setDeleteNotice(null)
    if (!deletePassword) {
      setDeleteNotice({ type: 'error', text: 'Enter your password to confirm permanent account deletion.' })
      return
    }
    setIsDeleting(true)
    try {
      const r = await fetch(API + '/auth/account', {
        method: 'DELETE',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deletePassword }),
      })
      const data = await r.json()
      if (r.ok) {
        setDeleteNotice({ type: 'success', text: 'Account and all data deleted. Returning to sign-in…' })
        setTimeout(() => {
          onSignOut()
        }, 1300)
      } else {
        setDeleteNotice({ type: 'error', text: data.detail || 'Could not delete account. Check your password.' })
      }
    } catch {
      setDeleteNotice({ type: 'error', text: 'Network error connecting to backend.' })
    } finally {
      setIsDeleting(false)
    }
  }

  const userInitial = displayName ? displayName[0].toUpperCase() : (user?.email ? user.email[0].toUpperCase() : 'U')
  const memberDate = user?.created_at ? new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : 'Local installation'

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="profile-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="profile-modal-header">
          <div className="profile-modal-user">
            <span className="avatar-lg">{userInitial}</span>
            <div>
              <h3>{displayName || user?.email?.split('@')[0] || 'User Profile'}</h3>
              <p>{user?.email} · {workspaceName || 'Personal Workspace'}</p>
            </div>
          </div>
          <button className="profile-modal-close" onClick={onClose} aria-label="Close dialog">
            <X size={20} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="profile-modal-nav">
          <button
            className={`profile-modal-tab ${tab === 'profile' ? 'active' : ''}`}
            onClick={() => setTab('profile')}
          >
            <User size={16} />
            Profile & Account
          </button>
          <button
            className={`profile-modal-tab ${tab === 'workspace' ? 'active' : ''}`}
            onClick={() => setTab('workspace')}
          >
            <HardDrive size={16} />
            My Workspace
          </button>
          <button
            className={`profile-modal-tab ${tab === 'stats' ? 'active' : ''}`}
            onClick={() => setTab('stats')}
          >
            <ChartNoAxesCombined size={16} />
            Learning Stats
          </button>
          <button
            className={`profile-modal-tab ${tab === 'security' ? 'active' : ''}`}
            onClick={() => setTab('security')}
          >
            <Lock size={16} />
            Security
          </button>
        </div>

        {/* Modal Body */}
        <div className="profile-modal-body">
          {tab === 'profile' && (
            <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {profileNotice && (
                <div className={`profile-alert ${profileNotice.type}`}>
                  {profileNotice.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  {profileNotice.text}
                </div>
              )}

              <div className="profile-field-group">
                <label>Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="Enter the Name"
                  maxLength={120}
                />
              </div>

              <div className="profile-field-group">
                <label>Email Address</label>
                <input type="email" value={user?.email || ''} disabled />
                <small style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-xs)' }}>
                  Email address is verified for this local account session.
                </small>
              </div>

              <div className="info-card">
                <div className="info-card-header">
                  <h4><Shield size={16} style={{ color: '#92e078' }} /> Account Details & Privacy</h4>
                  <span className="badge recommended">Local-First</span>
                </div>
                <p>
                  <strong>Account ID:</strong> #{user?.id || 1} &nbsp;·&nbsp;
                  <strong>Member Since:</strong> {memberDate}
                </p>
                <p style={{ marginTop: 6 }}>
                  All your uploaded notes, extracted knowledge graph nodes, and assessment records remain 100% private to your local environment.
                </p>
              </div>

              <button type="submit" className="dark-btn" style={{ alignSelf: 'flex-start', marginTop: 4 }} disabled={profileSaving}>
                {profileSaving ? 'Saving changes…' : 'Save Profile Changes'}
              </button>
            </form>
          )}

          {tab === 'workspace' && (
            <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {profileNotice && (
                <div className={`profile-alert ${profileNotice.type}`}>
                  {profileNotice.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  {profileNotice.text}
                </div>
              )}

              <div className="profile-field-group">
                <label>Workspace Name</label>
                <input
                  type="text"
                  value={workspaceName}
                  onChange={e => setWorkspaceName(e.target.value)}
                  placeholder="e.g. Personal learning or Neuroscience Lab"
                  maxLength={120}
                />
                <small style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-xs)' }}>
                  This label appears at the top of your sidebar dashboard.
                </small>
              </div>

              <div className="profile-stats-grid">
                <div className="profile-stat-box">
                  <span>Documents Ingested</span>
                  <strong>{dashboardData.documents}</strong>
                  <small style={{ color: 'var(--text-muted)' }}>{dashboardData.processed_documents} processed & indexed</small>
                </div>
                <div className="profile-stat-box">
                  <span>Concepts Mapped</span>
                  <strong>{dashboardData.concepts}</strong>
                  <small style={{ color: 'var(--text-muted)' }}>{dashboardData.assessed_concepts} assessed</small>
                </div>
              </div>

              <div className="info-card">
                <div className="info-card-header">
                  <h4><BrainCircuit size={16} style={{ color: '#92c974' }} /> Local AI Provider (Ollama)</h4>
                  <span className={`badge ${health?.ollama_available ? 'recommended' : 'snoozed'}`}>
                    {health?.ollama_available ? 'Online' : 'Offline'}
                  </span>
                </div>
                <p>
                  <strong>LLM:</strong> {health?.models?.llm || 'qwen3:4b'} &nbsp;·&nbsp;
                  <strong>Embeddings:</strong> {health?.models?.embedding || 'qwen3-embedding:0.6b'}
                </p>
                <p style={{ marginTop: 4 }}>
                  <strong>Database:</strong> {health?.database || 'SQLite development database'}
                </p>
              </div>

              <button type="submit" className="dark-btn" style={{ alignSelf: 'flex-start', marginTop: 4 }} disabled={profileSaving}>
                {profileSaving ? 'Saving workspace…' : 'Update Workspace'}
              </button>
            </form>
          )}

          {tab === 'stats' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="profile-stats-grid">
                <div className="profile-stat-box">
                  <span>Completed Assessments</span>
                  <strong>{dashboardData.signals?.total_assessments ?? 0}</strong>
                  <small style={{ color: 'var(--text-muted)' }}>{dashboardData.signals?.correct_answers ?? 0} correct answers</small>
                </div>
                <div className="profile-stat-box">
                  <span>Overall Accuracy</span>
                  <strong>{dashboardData.signals?.accuracy !== null && dashboardData.signals?.accuracy !== undefined ? `${dashboardData.signals.accuracy}%` : 'N/A'}</strong>
                  <small style={{ color: 'var(--text-muted)' }}>Based on recorded tests</small>
                </div>
                <div className="profile-stat-box">
                  <span>Retention Rate</span>
                  <strong>{dashboardData.signals?.retention_rate !== null && dashboardData.signals?.retention_rate !== undefined ? `${dashboardData.signals.retention_rate}%` : 'N/A'}</strong>
                  <small style={{ color: 'var(--text-muted)' }}>Calculated decay status</small>
                </div>
                <div className="profile-stat-box">
                  <span>Concepts At Risk</span>
                  <strong style={{ color: dashboardData.at_risk > 0 ? '#e08a50' : 'var(--text-primary)' }}>{dashboardData.at_risk}</strong>
                  <small style={{ color: 'var(--text-muted)' }}>Need revision soon</small>
                </div>
              </div>

              <div className="info-card">
                <div className="info-card-header">
                  <h4><Target size={16} style={{ color: '#92c974' }} /> Continuous Knowledge Maintenance</h4>
                  <span className="badge recommended">{dashboardData.recommendations.length} Pending</span>
                </div>
                <p>
                  ReMind uses deterministic spacing and decay tracking to prompt you right before memories fade.
                </p>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button
                    className="dark-btn"
                    style={{ fontSize: 'var(--fs-xs)', padding: '7px 12px' }}
                    onClick={() => { onNavigateTab('Analytics'); onClose(); }}
                  >
                    View Full Analytics
                  </button>
                  <button
                    className="light-btn"
                    style={{ fontSize: 'var(--fs-xs)', padding: '7px 12px' }}
                    onClick={() => { onNavigateTab('Revision Center'); onClose(); }}
                  >
                    Open Revision Center
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === 'security' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p className="eyebrow" style={{ margin: 0 }}>SECURITY SETTINGS</p>
                <h4 style={{ margin: 0, fontSize: 'var(--fs-md)', color: 'var(--text-primary)' }}>Change Password</h4>

                {passwordNotice && (
                  <div className={`profile-alert ${passwordNotice.type}`}>
                    {passwordNotice.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                    {passwordNotice.text}
                  </div>
                )}

                <div className="profile-field-group">
                  <label>Current Password</label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    required
                  />
                </div>

                <div className="profile-field-group">
                  <label>New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    minLength={8}
                    required
                  />
                </div>

                <div className="profile-field-group">
                  <label>Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    minLength={8}
                    required
                  />
                </div>

                <button type="submit" className="dark-btn" style={{ alignSelf: 'flex-start' }} disabled={passwordSaving}>
                  {passwordSaving ? 'Updating password…' : 'Update Password'}
                </button>
              </form>

              <div className="workspace-dropdown-divider" />

              <div className="info-card" style={{ borderColor: 'rgba(255,100,100,0.2)' }}>
                <div className="info-card-header">
                  <h4 style={{ color: '#d9534f' }}>Session Management</h4>
                </div>
                <p>Sign out of your active session on this device. Your data remains safely stored in your local workspace.</p>
                <button
                  type="button"
                  className="light-btn"
                  style={{ marginTop: 12, color: '#c9302c', borderColor: '#f5c6cb' }}
                  onClick={onSignOut}
                >
                  Sign Out
                </button>
              </div>

              <div className="workspace-dropdown-divider" />

              <div className="info-card" style={{ borderColor: 'rgba(217,56,56,0.3)', background: 'rgba(217,56,56,0.03)' }}>
                <div className="info-card-header">
                  <h4 style={{ color: '#c93b3b', display: 'flex', alignItems: 'center', gap: 7 }}>
                    <Trash2 size={16} /> Delete Account & Permanent Data Wipe
                  </h4>
                  <span className="badge" style={{ background: 'rgba(217,56,56,0.12)', color: '#c93b3b' }}>Danger Zone</span>
                </div>
                <p style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  Permanently delete your account along with all study materials, processed chunks, knowledge graph concepts, assessment records, learning decay history, and revision recommendations.
                </p>

                {!showDeleteConfirm ? (
                  <button
                    type="button"
                    className="danger-btn"
                    style={{ alignSelf: 'flex-start', marginTop: 10 }}
                    onClick={() => { setShowDeleteConfirm(true); setDeleteNotice(null); }}
                  >
                    <Trash2 size={15} />
                    Delete Account & Wipe All Data
                  </button>
                ) : (
                  <form onSubmit={handleDeleteAccount} className="danger-box">
                    <h5>
                      <AlertTriangle size={17} /> Confirm Permanent Deletion
                    </h5>
                    <p style={{ color: '#c93b3b', fontWeight: 600 }}>
                      This action is permanent and cannot be undone. All of the following will be wiped from the database:
                    </p>
                    <ul>
                      <li>All uploaded study documents & text chunks</li>
                      <li>All knowledge graph concepts & connections</li>
                      <li>All practice questions, quizzes & assessment history</li>
                      <li>All learning decay curves & revision recommendations</li>
                      <li>Your user account credentials & active session</li>
                    </ul>

                    {deleteNotice && (
                      <div className={`profile-alert ${deleteNotice.type}`}>
                        {deleteNotice.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                        {deleteNotice.text}
                      </div>
                    )}

                    <div className="profile-field-group" style={{ marginTop: 4 }}>
                      <label style={{ color: '#c93b3b' }}>Enter your password to confirm deletion</label>
                      <input
                        type="password"
                        value={deletePassword}
                        onChange={e => setDeletePassword(e.target.value)}
                        placeholder="Current account password"
                        disabled={isDeleting}
                        required
                        autoFocus
                      />
                    </div>

                    <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                      <button
                        type="submit"
                        className="danger-btn"
                        disabled={isDeleting || !deletePassword}
                      >
                        {isDeleting ? 'Deleting account and wiping data…' : 'Permanently Delete Everything'}
                      </button>
                      <button
                        type="button"
                        className="light-btn"
                        disabled={isDeleting}
                        onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); setDeleteNotice(null); }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="profile-modal-footer">
          <button className="light-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

function LoginPage({ authenticate }: { authenticate: (email: string, password: string, mode: 'login' | 'register') => Promise<void> }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email.includes('@')) return setError('Enter a valid email address.')
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    setBusy(true)
    try { await authenticate(email, password, mode) }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to continue.') }
    finally { setBusy(false) }
  }

  return (
    <main className="auth-page">
      <div className="gate-orb"></div>
      <section className="auth-copy">
        <div className="logo"><img src="/icon.png" alt="ReMind" className="brand-logo" /><b>ReMind</b></div>
        <p className="eyebrow">THE PERSONAL LEARNING SYSTEM</p>
        <h1>Make your knowledge<br /><i>stay with you.</i></h1>
        <p className="lead">Your personal AI study space that helps you remember what matters, understand ideas deeply, and revisit them at the right time.</p>
        <p className="fine">Your learning · Your choice of AI · Your control</p>
      </section>
      <section className="auth-card">
        <p className="eyebrow">WELCOME TO REMIND</p>
        <h2>{mode === 'login' ? 'Welcome back.' : 'Create your learning space.'}</h2>
        <p>{mode === 'login' ? 'Sign in to return to your material and learning rhythm.' : 'Use your email and a new password to begin.'}</p>
        <form onSubmit={submit}>
          <label>Email address
            <input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
          </label>
          <label>Password
            <input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" minLength={8} required />
          </label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="dark-btn auth-submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'} <ChevronRight size={16} />
          </button>
        </form>
        <button className="auth-switch" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>
          {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}
        </button>
      </section>
    </main>
  )
}

type ChatConversation = { id: number; title: string; provider_preference: string; model_preference: string; updated_at: string }
type OllamaModel = { id: string; label: string; installed: boolean }
type ChatMessage = { id: number; role: 'user' | 'assistant'; content: string; provider_used?: string | null; model_used?: string | null }

function ChatPage({ token, headers, onAlert, onOpenAssistant }: {
  token: string
  headers: () => Record<string, string>
  onAlert: (alert: AppAlertState) => void
  onOpenAssistant: () => void
}) {
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [active, setActive] = useState<ChatConversation | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [providerMode, setProviderMode] = useState<'ollama' | 'gemini' | 'groq'>(
    (localStorage.remindChatProviderMode && localStorage.remindChatProviderMode !== 'auto') ? localStorage.remindChatProviderMode as 'ollama' | 'gemini' | 'groq' : 'ollama'
  )
  const [ollamaModel, setOllamaModel] = useState('qwen2.5:3b')
  const [groqModel, setGroqModel] = useState(() => {
    const saved = localStorage.remindChatGroqModel
    return ['openai/gpt-oss-20b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-120b'].includes(saved)
      ? saved
      : 'openai/gpt-oss-20b'
  })
  const [geminiModel, setGeminiModel] = useState(() => {
    const saved = localStorage.remindChatGeminiModel
    return ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'].includes(saved)
      ? saved
      : 'gemini-3.1-flash-lite'
  })
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([])
  const [groqModels, setGroqModels] = useState<OllamaModel[]>([])
  const [geminiModels, setGeminiModels] = useState<OllamaModel[]>([])
  const [ollamaAvailable, setOllamaAvailable] = useState(true)
  const [groqAvailable, setGroqAvailable] = useState(true)
  const [geminiAvailable, setGeminiAvailable] = useState(true)
  const [useMaterials, setUseMaterials] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [retryable, setRetryable] = useState<{ conversationId: number; content: string; messageId: number } | null>(null)
  const [copiedMessageId, setCopiedMessageId] = useState<number | null>(null)
  const [openConversationMenu, setOpenConversationMenu] = useState<number | null>(null)
  const [renamingConversationId, setRenamingConversationId] = useState<number | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const messagesRef = useRef<HTMLDivElement>(null)

  const loadConversations = async () => {
    const response = await fetch(API + '/chat/conversations', { headers: headers() })
    if (!response.ok) throw new Error('Could not load conversations.')
    const items = await response.json() as ChatConversation[]
    setConversations(items)
  }
  const openConversation = async (conversation: ChatConversation) => {
    const response = await fetch(API + `/chat/conversations/${conversation.id}`, { headers: headers() })
    if (!response.ok) throw new Error('Could not load this conversation.')
    const body = await response.json()
    setActive(body.conversation)
    setMessages(body.messages)
    const convProvider = (body.conversation.provider_preference === 'auto' ? 'ollama' : (body.conversation.provider_preference || 'ollama')) as 'ollama' | 'gemini' | 'groq'
    setProviderMode(convProvider)
    if (convProvider === 'groq') {
      const preferred = body.conversation.model_preference
      const valid = ['openai/gpt-oss-20b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-120b'].includes(preferred)
        ? preferred
        : 'openai/gpt-oss-20b'
      setGroqModel(valid)
    } else if (convProvider === 'gemini') {
      const preferred = body.conversation.model_preference
      const valid = ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'].includes(preferred)
        ? preferred
        : 'gemini-3.1-flash-lite'
      setGeminiModel(valid)
    } else {
      setOllamaModel(body.conversation.model_preference || 'qwen2.5:3b')
    }
    setRetryable(null)
    setCopiedMessageId(null)
    setError('')
  }
  useEffect(() => {
    loadConversations().catch(error => setError(error instanceof Error ? error.message : 'Could not load conversations.'))
  }, [])
  const loadProviders = async () => {
    try {
      const response = await fetch(API + '/chat/providers', { headers: headers() })
      if (!response.ok) return
      const body = await response.json()
      const ollama = body.providers?.find((item: { id: string }) => item.id === 'ollama')
      setOllamaModels(ollama?.models || [])
      setOllamaAvailable(Boolean(ollama?.available))
      const groq = body.providers?.find((item: { id: string }) => item.id === 'groq')
      const models = groq?.models || []
      setGroqModels(models)
      setGroqAvailable(Boolean(groq?.available))
      setGroqModel((current: string) => {
        if (models.length && !models.some((m: { id: string }) => m.id === current)) {
          localStorage.remindChatGroqModel = models[0].id
          return models[0].id
        }
        return current
      })
      const gemini = body.providers?.find((item: { id: string }) => item.id === 'gemini')
      const gModels = gemini?.models || []
      setGeminiModels(gModels)
      setGeminiAvailable(Boolean(gemini?.available))
      setGeminiModel((current: string) => {
        if (gModels.length && !gModels.some((m: { id: string }) => m.id === current)) {
          localStorage.remindChatGeminiModel = gModels[0].id
          return gModels[0].id
        }
        return current
      })
    } catch {
      setOllamaAvailable(false)
      setGroqAvailable(false)
      setGeminiAvailable(false)
    }
  }
  useEffect(() => { void loadProviders() }, [])
  useEffect(() => {
    if (openConversationMenu === null) return
    const closeMenu = (event: MouseEvent) => {
      const target = event.target as Element
      if (!target.closest('.chat-conversation-menu-wrap')) setOpenConversationMenu(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenConversationMenu(null)
    }
    document.addEventListener('mousedown', closeMenu)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeMenu)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [openConversationMenu])
  useEffect(() => {
    const container = messagesRef.current
    if (container) container.scrollTop = container.scrollHeight
  }, [messages, busy])
  const newChat = async () => {
    const activeModel = providerMode === 'groq' ? groqModel : providerMode === 'gemini' ? geminiModel : ollamaModel
    const response = await fetch(API + '/chat/conversations', {
      method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider_preference: providerMode, model_preference: activeModel }),
    })
    if (!response.ok) throw new Error('Could not create a conversation.')
    const conversation = await response.json() as ChatConversation
    setConversations(items => [conversation, ...items])
    setActive(conversation); setMessages([]); setRetryable(null); setError('')
    setCopiedMessageId(null)
  }
  const removeChat = async (conversation: ChatConversation) => {
    setOpenConversationMenu(null)
    onAlert({
      title: 'Delete conversation?',
      message: 'This will permanently remove the conversation and all of its messages.',
      tone: 'confirm',
      confirmLabel: 'Delete conversation',
      onConfirm: async () => {
        const response = await fetch(API + `/chat/conversations/${conversation.id}`, { method: 'DELETE', headers: headers() })
        if (!response.ok) { setError('Could not delete the conversation.'); return }
        const remaining = conversations.filter(item => item.id !== conversation.id)
        setConversations(remaining)
        if (active?.id === conversation.id) {
          setActive(null); setMessages([])
          if (remaining[0]) await openConversation(remaining[0])
        }
      }
    })
  }
  const beginRename = (conversation: ChatConversation) => {
    setOpenConversationMenu(null)
    setRenamingConversationId(conversation.id)
    setRenameDraft(conversation.title)
  }
  const renameChat = async (conversation: ChatConversation) => {
    const title = renameDraft.trim()
    if (!title) {
      setError('Enter a name for this chat.')
      return
    }
    try {
      const response = await fetch(API + `/chat/conversations/${conversation.id}`, {
        method: 'PATCH',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.detail || 'Could not rename the conversation.')
      setConversations(items => items.map(item => item.id === conversation.id ? body : item))
      if (active?.id === conversation.id) setActive(body)
      setRenamingConversationId(null)
      setRenameDraft('')
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : 'Could not rename the conversation.')
    }
  }
  const findLastUserMessage = async (conversationId: number) => {
    const response = await fetch(API + `/chat/conversations/${conversationId}`, { headers: headers() })
    if (!response.ok) return null
    const history = await response.json()
    return [...history.messages].reverse().find((message: ChatMessage) => message.role === 'user') as ChatMessage | undefined
  }
  const send = async (retryMessage?: { conversationId: number; content: string; messageId: number }) => {
    const content = (retryMessage?.content || draft).trim()
    if (!content || busy) return
    const activeModel = providerMode === 'groq' ? groqModel : providerMode === 'gemini' ? geminiModel : ollamaModel
    let conversation = retryMessage
      ? conversations.find(item => item.id === retryMessage.conversationId) || active
      : active || conversations[0]
    if (!conversation) {
      const response = await fetch(API + '/chat/conversations', {
        method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_preference: providerMode, model_preference: activeModel }),
      })
      if (!response.ok) { setError('Could not create a conversation.'); return }
      conversation = await response.json() as ChatConversation
      setActive(conversation); setConversations([conversation])
    }
    if (!conversation) return
    setBusy(true); setError(''); setDraft('')
    if (!retryMessage) setMessages(items => [...items, { id: Date.now(), role: 'user', content }])
    try {
      const response = await fetch(API + `/chat/conversations/${conversation.id}/messages`, {
        method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content, provider: providerMode, model: activeModel, use_materials: useMaterials,
          retry_message_id: retryMessage?.messageId,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        let errorDetail = 'The assistant could not generate a response.'
        if (typeof body.detail === 'string') {
          errorDetail = body.detail
        } else if (Array.isArray(body.detail)) {
          errorDetail = body.detail.map((item: any) => item.msg || JSON.stringify(item)).join(', ')
        } else if (body.detail) {
          errorDetail = JSON.stringify(body.detail)
        }
        throw new Error(errorDetail)
      }
      if (!retryMessage && body.user_message_id) {
        setMessages(items => {
          const lastUser = [...items].reverse().find(item => item.role === 'user' && item.content === content)
          return items.map(message => message.id === lastUser?.id ? { ...message, id: body.user_message_id } : message)
        })
      }
      setMessages(items => [...items, body.message])
      setActive(body.conversation)
      setConversations(items => [body.conversation, ...items.filter(item => item.id !== body.conversation.id)])
      setRetryable(null)
      if (document.hidden) {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Assistant response ready', { body: 'Your ReMind study assistant has finished responding.' })
        }
        onAlert({
          title: 'Assistant response ready',
          message: 'Your study assistant has finished responding. Open the assistant to continue learning.',
          tone: 'success',
          confirmLabel: 'Open assistant',
          onConfirm: onOpenAssistant,
        })
      }
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'The assistant could not generate a response.')
      try {
        const historyResponse = await fetch(API + `/chat/conversations/${conversation.id}`, { headers: headers() })
        if (historyResponse.ok) {
          const history = await historyResponse.json()
          const lastUserMessage = [...history.messages].reverse().find((message: ChatMessage) => message.role === 'user')
          if (lastUserMessage) setRetryable({ conversationId: conversation.id, content: lastUserMessage.content, messageId: lastUserMessage.id })
        }
      } catch { /* Preserve the original generation error if history cannot be refreshed. */ }
    } finally { setBusy(false) }
  }
  const renderMessage = (message: ChatMessage) => {
    const parts = message.content.split(/```([\s\S]*?)```/g)
    return parts.map((part, index) => index % 2 === 1
      ? <pre key={index}><code>{part.replace(/^[a-z]+\n/i, '')}</code><button className="chat-copy" onClick={() => navigator.clipboard.writeText(part)} title="Copy code"><Copy size={14} /></button></pre>
      : <span key={index}>{part.split(/(\*\*[^*]+\*\*)/g).map((text, partIndex) => text.startsWith('**') ? <strong key={partIndex}>{text.slice(2, -2)}</strong> : text)}</span>)
  }
  const copyResponse = async (message: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopiedMessageId(message.id)
      window.setTimeout(() => setCopiedMessageId(current => current === message.id ? null : current), 1800)
    } catch {
      onAlert({ title: 'Copy failed', message: 'The response could not be copied to your clipboard. Please try again.', tone: 'error' })
    }
  }
  return <section className="chat-layout">
    <aside className="chat-sidebar">
      <button className="dark-btn" onClick={() => newChat().catch(error => setError(error.message))}><Plus size={16} /> New chat</button>
      <div className="chat-conversation-list">{conversations.map(conversation =>
        <div className={`chat-conversation ${active?.id === conversation.id ? 'active' : ''}`} key={conversation.id}>
          {renamingConversationId === conversation.id
            ? <div className="chat-rename-editor">
              <input value={renameDraft} onChange={event => setRenameDraft(event.target.value)} onKeyDown={event => {
                if (event.key === 'Enter') { event.preventDefault(); void renameChat(conversation) }
                if (event.key === 'Escape') { setRenamingConversationId(null); setRenameDraft('') }
              }} autoFocus aria-label="Chat name" maxLength={160} />
              <div className="chat-rename-actions">
                <button type="button" onClick={() => { void renameChat(conversation) }}>Save</button>
                <button type="button" onClick={() => { setRenamingConversationId(null); setRenameDraft('') }}>Cancel</button>
              </div>
            </div>
            : <>
              <button className="chat-conversation-title" onClick={() => openConversation(conversation).catch(error => setError(error.message))}>{conversation.title}</button>
              <div className="chat-conversation-menu-wrap">
                <button className="chat-menu-button" onClick={() => setOpenConversationMenu(current => current === conversation.id ? null : conversation.id)} aria-label={`Options for ${conversation.title}`} aria-expanded={openConversationMenu === conversation.id}><MoreHorizontal size={16} /></button>
                {openConversationMenu === conversation.id && <div className="chat-conversation-menu">
                  <button onClick={() => beginRename(conversation)}><Pencil size={14} /> Rename</button>
                  <button className="danger" onClick={() => { void removeChat(conversation) }}><Trash2 size={14} /> Delete</button>
                </div>}
              </div>
            </>}
        </div>)}</div>
    </aside>
    <div className="chat-main">
      <div className="chat-messages" ref={messagesRef}>
        {!messages.length && <div className="chat-empty"><Sparkles size={28} /><h3>What would you like to learn?</h3><p>Ask a question, request an explanation, or start a quiz.</p><div className="chat-prompts">{['Explain DBMS in simple terms.', 'Teach me the four OOP principles.', 'Summarize a topic for revision.'].map(prompt => <button key={prompt} onClick={() => setDraft(prompt)}>{prompt}</button>)}</div></div>}
        {messages.map((message, index) => {
          const isLatestAssistant = message.role === 'assistant' && !messages.slice(index + 1).some(item => item.role === 'assistant')
          const previousUser = [...messages.slice(0, index)].reverse().find(item => item.role === 'user')
          return <div className={`chat-bubble ${message.role}`} key={message.id}>
            <div className="chat-content">{renderMessage(message)}</div>
            {isLatestAssistant && message.role === 'assistant' && <div className="chat-actions">
              <button className="chat-retry-action chat-copy-response" onClick={() => { void copyResponse(message) }} title="Copy complete response" aria-label="Copy complete response">
                {copiedMessageId === message.id ? <CheckCircle2 size={13} /> : <Copy size={13} />}
                {copiedMessageId === message.id ? 'Copied' : 'Copy'}
              </button>
              {previousUser && <button className="chat-retry-action" onClick={() => { void send({ conversationId: active?.id || 0, content: previousUser.content, messageId: previousUser.id }) }} disabled={busy}><RotateCw size={13} /> Retry response</button>}
            </div>}
          </div>
        })}
        {busy && <div className="chat-bubble assistant chat-thinking"><div className="chat-thinking-status"><Sparkles size={15} /><span>Preparing your answer</span><i className="thinking-dots"><b></b><b></b><b></b></i></div></div>}
      </div>
      {error && <div className="chat-error notice"><span>{error}</span>{retryable && <button className="light-btn chat-retry-btn" onClick={() => { void send(retryable) }} disabled={busy}><RotateCw size={14} /> Try again</button>}</div>}
      <div className="chat-composer">
        <div className="chat-input-wrap">
          <textarea value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send() } }} placeholder="Ask your study assistant..." rows={2} />
          <button className="chat-send-btn" onClick={() => { void send() }} disabled={busy || !draft.trim()} aria-label="Send message" title="Send message"><ArrowUp size={19} strokeWidth={2.5} /></button>
        </div>
        <div className="chat-composer-tools">
          <label className="chat-tool-select">Provider
            <select
              value={providerMode}
              onChange={event => {
                const mode = event.target.value as 'ollama' | 'gemini' | 'groq'
                setProviderMode(mode)
                localStorage.remindChatProviderMode = mode
              }}
              aria-label="AI provider"
            >
              <option value="ollama">Ollama (local)</option>
              <option value="gemini">Gemini (cloud)</option>
              <option value="groq">Groq (cloud)</option>
            </select>
          </label>
          {providerMode === 'ollama' && <label className="chat-tool-select">Local model
            {ollamaModel === 'qwen2.5:3b' && <span className="preferred-model-badge" title="Recommended for study assistant chat"><Sparkles size={12} /> Preferred</span>}
            <select value={ollamaModel} onChange={event => setOllamaModel(event.target.value)} aria-label="Ollama model" disabled={!ollamaAvailable}>
              {ollamaModels.length ? ollamaModels.map(model => <option key={model.id} value={model.id} disabled={!model.installed}>{model.label}{model.installed ? '' : ' (not installed)'}</option>) : <option value={ollamaModel}>{ollamaAvailable ? 'Loading models…' : 'Ollama unavailable'}</option>}
            </select>
            <button className="chat-refresh-models" type="button" onClick={() => { void loadProviders() }} title="Refresh Ollama model availability" aria-label="Refresh Ollama model availability"><RotateCw size={13} /></button>
          </label>}
          {providerMode === 'groq' && <label className="chat-tool-select">Groq model
            <select
              value={groqModel}
              onChange={event => {
                setGroqModel(event.target.value)
                localStorage.remindChatGroqModel = event.target.value
              }}
              aria-label="Groq model"
            >
              {groqModels.length
                ? groqModels.map(model => <option key={model.id} value={model.id}>{model.label || model.id}</option>)
                : (
                  <>
                    <option value="openai/gpt-oss-20b">openai/gpt-oss-20b</option>
                    <option value="qwen/qwen3.8-27b">qwen/qwen3.8-27b</option>
                    <option value="openai/gpt-oss-120b">openai/gpt-oss-120b</option>
                  </>
                )}
            </select>
            <button className="chat-refresh-models" type="button" onClick={() => { void loadProviders() }} title="Refresh Groq models" aria-label="Refresh Groq models"><RotateCw size={13} /></button>
          </label>}
          {providerMode === 'gemini' && <label className="chat-tool-select">Gemini model
            <select
              value={geminiModel}
              onChange={event => {
                setGeminiModel(event.target.value)
                localStorage.remindChatGeminiModel = event.target.value
              }}
              aria-label="Gemini model"
              disabled={!geminiAvailable}
            >
              {geminiModels.length
                ? geminiModels.map(model => <option key={model.id} value={model.id}>{model.label || model.id}</option>)
                : (
                  <>
                    <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite</option>
                    <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash Lite</option>
                  </>
                )}
            </select>
            <button className="chat-refresh-models" type="button" onClick={() => { void loadProviders() }} title="Refresh Gemini models" aria-label="Refresh Gemini models"><RotateCw size={13} /></button>
          </label>}
          <label className="chat-tool-toggle"><input type="checkbox" checked={useMaterials} onChange={event => setUseMaterials(event.target.checked)} /> <span>Use uploaded materials</span></label>
        </div>
      </div>
    </div>
  </section>
}

type WorkflowToast = { state: 'uploading' | 'success' | 'error' | 'info'; title: string; message: string }

function WorkflowToast({ state, title, message, onClose }: WorkflowToast & { onClose: () => void }) {
  return (
    <div className={`workflow-toast ${state}`} role="status" aria-live="polite">
      <div className="workflow-toast-icon">
        {state === 'uploading' || state === 'info' ? <RotateCw size={16} className="spin" /> : state === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
      </div>
      <div className="workflow-toast-copy">
        <strong>{title}</strong>
        <span>{message}</span>
      </div>
      {state !== 'uploading' && state !== 'info' && <button type="button" onClick={onClose} aria-label="Dismiss notification"><X size={15} /></button>}
    </div>
  )
}

function LibraryPage({ headers, refresh, documentsRefreshKey, onWorkflowNotify }: {
  headers: () => Record<string, string>
  refresh: () => Promise<void>
  documentsRefreshKey: number
  onWorkflowNotify: (toast: WorkflowToast) => void
}) {
  const [docs, setDocs] = useState<any[]>([])
  const [message, setMessage] = useState('')
  const [deleting, setDeleting] = useState<number | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; name: string } | null>(null)

  const load = async () => {
    let r = await fetch(API + '/documents', { headers: headers() })
    if (r.ok) setDocs(await r.json())
  }
  useEffect(() => { load() }, [documentsRefreshKey])

  const action = async (id: number, path: string) => {
    const isExtraction = path === 'extract-concepts'
    setMessage('Working with local AI…')
    if (isExtraction) onWorkflowNotify({ state: 'info', title: 'Extracting concepts', message: 'ReMind is reading your material and building your knowledge map…' })
    try {
      const r = await fetch(`${API}/documents/${id}/${path}`, { method: 'POST', headers: headers() })
      const b = await r.json().catch(() => ({}))
      const message = r.ok ? `${path === 'retry' ? 'Indexed' : `Added ${b.concepts_added || 0} concepts`} successfully.` : b.detail || 'Action failed. Start Ollama and try again.'
      if (isExtraction) {
        onWorkflowNotify({ state: r.ok ? 'success' : 'error', title: r.ok ? 'Extraction complete' : 'Extraction failed', message })
      } else {
        setMessage(message)
      }
      await load()
      await refresh()
    } catch {
      if (isExtraction) {
        onWorkflowNotify({ state: 'error', title: 'Extraction failed', message: 'Could not connect to the server. Please try again.' })
      } else {
        setMessage('Could not connect to the server. Please try again.')
      }
    }
  }

  const deleteDoc = async (id: number, name: string) => {
    setDeleting(id)
    setMessage('')
    try {
      const r = await fetch(`${API}/documents/${id}`, { method: 'DELETE', headers: headers() })
      const b = await r.json()
      if (r.ok) {
        const parts = [`"${b.document}" deleted.`]
        if (b.removed_concepts > 0) parts.push(`${b.removed_concepts} concept${b.removed_concepts > 1 ? 's' : ''} removed.`)
        if (b.removed_assessments > 0) parts.push(`${b.removed_assessments} assessment${b.removed_assessments > 1 ? 's' : ''} cleared.`)
        setMessage(parts.join(' '))
      } else {
        setMessage(b.detail || 'Could not delete document.')
      }
    } catch {
      setMessage('Could not connect to server.')
    } finally {
      setDeleting(null)
      await load()
      await refresh()
    }
  }

  return (
    <section className="panel data-page">
      <p className="eyebrow">YOUR SOURCES</p>
      <h3>Document library</h3>
      {message && <p className="notice">{message}</p>}
      {docs.length ? docs.map(d => (
        <article key={d.id} className="data-row">
          <div>
            <b>{d.name}</b>
            <p>Status: <span className="status">{d.status}</span></p>
          </div>
          <div className="row-actions">
            {d.status !== 'indexed' && <button onClick={() => action(d.id, 'retry')}>Index with Ollama</button>}
            <button onClick={() => action(d.id, 'extract-concepts')}>Extract concepts</button>
            <button
              onClick={() => setDeleteConfirm({ id: d.id, name: d.name })}
              disabled={deleting === d.id}
              style={{
                background: 'var(--feedback-err-bg,#fdf2f2)',
                color: 'var(--feedback-err-text,#8e2a2a)',
                border: '1px solid var(--feedback-err-border,#f9d5d5)',
                display: 'inline-flex', alignItems: 'center', gap: 6
              }}
            >
              {deleting === d.id
                ? <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><span className="spin" style={{ fontSize: 12 }}>↻</span>Deleting…</span>
                : <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                  Delete
                </span>
              }
            </button>
          </div>
        </article>
      )) : (
        <div className="empty">
          <b>No study materials yet</b>
          <p>Upload a document to extract passages, embeddings, and concepts.</p>
        </div>
      )}
      {deleteConfirm && (
        <AppAlert
          title="Delete study material?"
          message={`"${deleteConfirm.name}" and all related concepts, revision items, assessments, and learning history will be permanently removed.`}
          tone="confirm"
          confirmLabel="Delete permanently"
          onClose={() => setDeleteConfirm(null)}
          onConfirm={() => {
            const { id, name } = deleteConfirm
            setDeleteConfirm(null)
            void deleteDoc(id, name)
          }}
        />
      )}
    </section>
  )
}

function GraphPage({ headers }: { headers: () => Record<string, string> }) {
  const [graph, setGraph] = useState<{ nodes: any[], edges: any[], relationship_count?: number, insights?: any }>({ nodes: [], edges: [] })
  useEffect(() => {
    fetch(API + '/knowledge-graph', { headers: headers() }).then(r => r.ok ? r.json() : null).then(x => x && setGraph(x))
  }, [])

  return (
    <section className="panel data-page">
      <p className="eyebrow">SOURCE-GROUNDED STRUCTURE</p>
      <h3>Knowledge map</h3>
      {graph.nodes.length ? <>
        {graph.insights && (
          <>
            <div className="knowledge-insight-grid">
              <div><span>Concept coverage</span><strong>{graph.insights.coverage_percent}%</strong><small>{graph.insights.assessed_count} of {graph.insights.concept_count} assessed</small></div>
              <div><span>Average recall</span><strong>{graph.insights.average_accuracy !== null ? `${graph.insights.average_accuracy}%` : '—'}</strong><small>Across assessed concepts</small></div>
              <div><span>High-risk concepts</span><strong>{graph.insights.high_risk_count}</strong><small>Need timely review</small></div>
              <div><span>Assessments completed</span><strong>{graph.insights.completed_assessments}</strong><small>{graph.insights.document_count} source{graph.insights.document_count === 1 ? '' : 's'}</small></div>
            </div>
            <div className="knowledge-insight-panels">
              <div className="knowledge-insight-panel">
                <div className="knowledge-insight-heading"><b>Strongest recall</b><span>accuracy</span></div>
                {graph.insights.strongest.length ? graph.insights.strongest.map((node: any) => (
                  <div className="knowledge-ranking" key={node.id}><span>{node.label}</span><strong>{node.accuracy}%</strong></div>
                )) : <p className="fine">Complete an assessment to build a recall baseline.</p>}
              </div>
              <div className="knowledge-insight-panel">
                <div className="knowledge-insight-heading"><b>Needs attention</b><span>priority</span></div>
                {graph.insights.needs_attention.length ? graph.insights.needs_attention.map((node: any) => (
                  <div className="knowledge-ranking" key={node.id}><span>{node.label}</span><strong className={node.risk === null ? 'unassessed' : ''}>{node.risk === null ? 'New' : `${node.risk}% risk`}</strong></div>
                )) : <p className="fine">Your knowledge map is in good shape.</p>}
              </div>
            </div>
          </>
        )}
        <div className="graph-list">
          {graph.nodes.map(n => (
            <article key={n.id}>
              <span className={n.assessed ? 'node assessed' : 'node'}></span>
              <div>
                <b>{n.label}</b>
                <p>{n.topic} · {n.assessed ? `${n.accuracy}% recall · ${n.attempts} attempt${n.attempts === 1 ? '' : 's'}` : 'Not assessed'}</p>
              </div>
            </article>
          ))}
        </div>
        <p className="fine">{graph.relationship_count ?? graph.edges.length} evidence-backed relationship{(graph.relationship_count ?? graph.edges.length) === 1 ? '' : 's'} stored.</p>
      </> : (
        <div className="empty">
          <b>No concepts to map</b>
          <p>Upload material, then choose “Extract concepts” in My Library while Ollama is running.</p>
        </div>
      )}
    </section>
  )
}

function AnalyticsPage({
  headers,
  refresh,
  onNotify
}: {
  headers: () => Record<string, string>,
  refresh: () => Promise<void>,
  onNotify: (title: string, message: string, tone: 'success' | 'error') => void
}) {
  const [stats, setStats] = useState<any>()
  const [selectedAssessments, setSelectedAssessments] = useState<number[]>([])
  const [sortMode, setSortMode] = useState<'newest' | 'oldest' | 'highest' | 'lowest'>('newest')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [notification, setNotification] = useState<{ title: string; message: string; tone: 'success' | 'error' } | null>(null)
  const [busy, setBusy] = useState(false)
  const load = () => fetch(API + '/analytics', { headers: headers() }).then(r => r.ok ? r.json() : null).then(data => {
    if (data) {
      setStats(data)
      setSelectedAssessments(current => current.filter(id => data.assessments.some((item: any) => item.id === id)))
    }
  })
  useEffect(() => { void load() }, [])
  const assessments = [...(stats?.assessments || [])].sort((a, b) => {
    if (sortMode === 'highest') return (b.score / Math.max(b.max_score, 1)) - (a.score / Math.max(a.max_score, 1))
    if (sortMode === 'lowest') return (a.score / Math.max(a.max_score, 1)) - (b.score / Math.max(b.max_score, 1))
    const direction = sortMode === 'newest' ? -1 : 1
    return direction * (new Date(a.at).getTime() - new Date(b.at).getTime())
  })
  const allSelected = assessments.length > 0 && assessments.every((assessment: any) => selectedAssessments.includes(assessment.id))
  const toggleAssessment = (id: number) => setSelectedAssessments(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  const deleteSelected = async () => {
    setBusy(true)
    try {
      const response = await fetch(API + '/analytics/assessments', {
        method: 'DELETE',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ assessment_ids: selectedAssessments })
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.detail || 'Selected assessments could not be deleted.')
      setDeleteConfirm(false)
      setSelectedAssessments([])
      await load()
      await refresh()
      onNotify(
        'Assessments deleted',
        `${body.deleted_count || selectedAssessments.length} assessment record${(body.deleted_count || selectedAssessments.length) === 1 ? '' : 's'} removed successfully.`,
        'success'
      )
    } catch (error) {
      setDeleteConfirm(false)
      setNotification({
        title: 'Deletion failed',
        message: error instanceof Error ? error.message : 'Selected assessments could not be deleted.',
        tone: 'error'
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel data-page">
      <p className="eyebrow">RECORDED EVIDENCE</p>
      <h3>Learning analytics</h3>
      {stats ? (
        <>
          <div className="stats">
            <Stat label="Completed assessments" value={stats.assessment_count} note="Submitted assessments" icon={<BookOpen />} />
            <Stat label="Accuracy" value={stats.accuracy === null ? '—' : `${Math.round(stats.accuracy * 100)}%`} note="Observed, not predicted" icon={<Target />} />
            <Stat label="Revision completion" value={stats.revision_completion_rate === null ? '—' : `${Math.round(stats.revision_completion_rate * 100)}%`} note="Completed recommendations" icon={<Clock3 />} />
          </div>
          {stats.assessments && stats.assessments.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div className="analytics-log-head">
                <p className="eyebrow">ASSESSMENT ATTEMPTS LOG</p>
                <div className="analytics-log-actions">
                  <label className="revision-filter">
                    <span>Sort</span>
                    <select value={sortMode} onChange={event => setSortMode(event.target.value as typeof sortMode)}>
                      <option value="newest">Newest</option>
                      <option value="oldest">Oldest</option>
                      <option value="highest">Highest score</option>
                      <option value="lowest">Lowest score</option>
                    </select>
                  </label>
                  <button className="danger-btn" disabled={!selectedAssessments.length || busy} onClick={() => setDeleteConfirm(true)}>
                    Delete selected{selectedAssessments.length ? ` (${selectedAssessments.length})` : ''}
                  </button>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                <label className="analytics-select-all">
                  <input type="checkbox" checked={allSelected} onChange={() => setSelectedAssessments(allSelected ? [] : assessments.map((assessment: any) => assessment.id))} />
                  <span>Select all visible assessments</span>
                </label>
                {assessments.map((assessment: any, i: number) => (
                  <div key={i} className="theme-surface" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: 8, fontSize: 12 }}>
                    <label className="analytics-attempt-row">
                      <input type="checkbox" checked={selectedAssessments.includes(assessment.id)} onChange={() => toggleAssessment(assessment.id)} />
                      <span>{assessment.title || `Assessment ${i + 1}`} · {new Date(assessment.at).toLocaleString()}</span>
                    </label>
                    <span className={`badge ${assessment.score === assessment.max_score ? 'completed' : 'snoozed'}`}>
                      {assessment.score}/{assessment.max_score} correct
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {deleteConfirm && (
            <AppAlert
              title="Delete selected assessments?"
              message={`This will permanently remove ${selectedAssessments.length} assessment record${selectedAssessments.length === 1 ? '' : 's'}, its questions, and its answer history.`}
              tone="confirm"
              confirmLabel="Delete permanently"
              onClose={() => setDeleteConfirm(false)}
              onConfirm={() => void deleteSelected()}
            />
          )}
          {notification && (
            <AppAlert
              title={notification.title}
              message={notification.message}
              tone={notification.tone}
              onClose={() => setNotification(null)}
            />
          )}
        </>
      ) : (
        <div className="empty"><b>Loading recorded metrics…</b></div>
      )}
    </section>
  )
}

function RevisionCenterPage({
  headers,
  refresh,
  onStartAssessment,
  onNotify
}: {
  headers: () => Record<string, string>,
  refresh: () => Promise<void>,
  onStartAssessment: (id: number) => void,
  onNotify: (title: string, message: string, tone: 'success' | 'error') => void
}) {
  const [revisions, setRevisions] = useState<any[]>([])
  const [busy, setBusy] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'completed'>('all')

  const load = async () => {
    try {
      const r = await fetch(API + '/revisions', { headers: headers() })
      if (r.ok) setRevisions(await r.json())
    } catch { }
  }
  useEffect(() => { load() }, [])

  const updateStatus = async (id: number, status: string) => {
    try {
      const r = await fetch(`${API}/revisions/${id}`, {
        method: 'PATCH',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      })
      if (r.ok) {
        await load()
        await refresh()
      }
    } catch { }
  }

  const recalculate = async () => {
    setBusy(true)
    try {
      const r = await fetch(API + '/revisions/rebuild', { method: 'POST', headers: headers() })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) {
        onNotify('Revision queue update failed', data.detail || 'Revision recommendations could not be recalculated. Please try again.', 'error')
        return
      }
      onNotify('Revision queue updated', data.message || 'Your revision recommendations are up to date.', 'success')
      await load()
      await refresh()
    } catch {
      onNotify('Revision queue update failed', 'Could not connect to update revision recommendations. Please try again.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const visibleRevisions = revisions.filter(revision =>
    statusFilter === 'all'
    || (statusFilter === 'completed' ? revision.status === 'completed' : revision.status !== 'completed')
  )

  return (
    <section className="panel data-page">
      <div className="panel-head">
        <div>
          <p className="eyebrow">TARGETED RETENTION</p>
          <h3>Revision Center</h3>
        </div>
        <div className="revision-toolbar">
          <label className="revision-filter">
            <span>Show</span>
            <select
              value={statusFilter}
              onChange={event => setStatusFilter(event.target.value as 'all' | 'open' | 'completed')}
              aria-label="Filter revision topics by status"
            >
              <option value="all">All topics</option>
              <option value="open">Open topics</option>
              <option value="completed">Completed topics</option>
            </select>
          </label>
          <button onClick={recalculate} disabled={busy}>
            {busy ? <><RotateCw size={13} className="spin" /> Recalculating…</> : 'Recalculate queue'}
          </button>
        </div>
      </div>
      {visibleRevisions.length ? (
        visibleRevisions.map(r => (
          <article key={r.id} className="data-row">
            <div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <b>{r.concept}</b>
                <span className={`badge ${r.status}`}>{r.status}</span>
                <span className="priority" style={{ display: 'inline-grid', width: 22, height: 22, fontSize: 10 }}>{r.priority}</span>
              </div>
              <p>{r.reason}</p>
            </div>
            <div className="row-actions">
              {r.status !== 'completed' && <button onClick={() => onStartAssessment(r.concept_id)}>Take recall check</button>}
              {r.status !== 'completed' && <button onClick={() => updateStatus(r.id, 'completed')}>Mark complete</button>}
              {r.status === 'recommended' && <button onClick={() => updateStatus(r.id, 'snoozed')}>Snooze</button>}
            </div>
          </article>
        ))
      ) : (
        <div className="empty">
          <span><Clock3 size={23} /></span>
          <b>{revisions.length ? 'No matching topics' : 'Revision queue is clear'}</b>
          <p>
            {revisions.length
              ? `There are no ${statusFilter === 'completed' ? 'completed' : 'open'} topics to show.`
              : 'No revision items currently scheduled. Click "Recalculate queue" or upload study materials to start.'}
          </p>
        </div>
      )}
    </section>
  )
}

function AssessmentsPage({
  headers,
  refresh,
  initialConceptId,
  onAssessmentGenerated,
  onCloseAssessment,
  assessmentToOpenId
}: {
  headers: () => Record<string, string>,
  refresh: () => Promise<void>,
  initialConceptId?: number | null,
  onAssessmentGenerated: (assessmentId: number) => void,
  onCloseAssessment: () => void,
  assessmentToOpenId?: number | null
}) {
  const [concepts, setConcepts] = useState<any[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(initialConceptId || null)
  const [assessment, setAssessment] = useState<any>(null)
  const [responses, setResponses] = useState<Record<number, string>>({})
  const [results, setResults] = useState<Record<number, any>>({})
  const [questionCount, setQuestionCount] = useState(10)
  const [questionTypes, setQuestionTypes] = useState<Array<'multiple_choice' | 'true_false'>>(['multiple_choice'])
  const [providerMode, setProviderMode] = useState<'gemini' | 'ollama' | 'groq'>(
    (localStorage.remindProviderMode && localStorage.remindProviderMode !== 'auto')
      ? localStorage.remindProviderMode as 'gemini' | 'ollama' | 'groq'
      : 'ollama'
  )
  const [ollamaModel, setOllamaModel] = useState(localStorage.remindAssessmentModel || 'qwen3:4b')
  const [groqModel, setGroqModel] = useState(() => {
    const saved = localStorage.remindAssessmentGroqModel
    return ['openai/gpt-oss-20b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-120b'].includes(saved)
      ? saved
      : 'openai/gpt-oss-20b'
  })
  const [geminiModel, setGeminiModel] = useState(() => {
    const saved = localStorage.remindAssessmentGeminiModel
    return ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'].includes(saved)
      ? saved
      : 'gemini-3.1-flash-lite'
  })
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([])
  const [groqModels, setGroqModels] = useState<OllamaModel[]>([])
  const [geminiModels, setGeminiModels] = useState<OllamaModel[]>([])
  const [ollamaAvailable, setOllamaAvailable] = useState(true)
  const [groqAvailable, setGroqAvailable] = useState(true)
  const [geminiAvailable, setGeminiAvailable] = useState(true)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [questionTypesOpen, setQuestionTypesOpen] = useState(false)
  const questionTypesRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(API + '/concepts', { headers: headers() })
      .then(r => r.ok ? r.json() : [])
      .then(list => {
        setConcepts(list)
        if (!selectedId && list.length > 0) setSelectedId(list[0].id)
      })
  }, [])
  useEffect(() => {
    fetch(API + '/chat/providers', { headers: headers() })
      .then(response => response.ok ? response.json() : null)
      .then(body => {
        const ollama = body?.providers?.find((item: { id: string }) => item.id === 'ollama')
        setOllamaModels(ollama?.models || [])
        setOllamaAvailable(Boolean(ollama?.available))
        const groq = body?.providers?.find((item: { id: string }) => item.id === 'groq')
        const models = groq?.models || []
        setGroqModels(models)
        setGroqAvailable(Boolean(groq?.available))
        setGroqModel((current: string) => {
          if (models.length && !models.some((m: { id: string }) => m.id === current)) {
            localStorage.remindAssessmentGroqModel = models[0].id
            return models[0].id
          }
          return current
        })
        const gemini = body?.providers?.find((item: { id: string }) => item.id === 'gemini')
        const gModels = gemini?.models || []
        setGeminiModels(gModels)
        setGeminiAvailable(Boolean(gemini?.available))
        setGeminiModel((current: string) => {
          if (gModels.length && !gModels.some((m: { id: string }) => m.id === current)) {
            localStorage.remindAssessmentGeminiModel = gModels[0].id
            return gModels[0].id
          }
          return current
        })
      })
      .catch(() => {
        setOllamaAvailable(false)
        setGroqAvailable(false)
        setGeminiAvailable(false)
      })
  }, [])

  useEffect(() => {
    if (initialConceptId) {
      setSelectedId(initialConceptId)
      setAssessment(null)
      setResponses({})
      setResults({})
    }
  }, [initialConceptId])

  useEffect(() => {
    if (!assessmentToOpenId) return
    let cancelled = false
    fetch(`${API}/assessments/${assessmentToOpenId}`, { headers: headers() })
      .then(async response => {
        if (!response.ok) throw new Error('The generated assessment could not be loaded.')
        return response.json()
      })
      .then(detail => {
        if (!cancelled) {
          if (Number.isInteger(detail.concept_id)) setSelectedId(detail.concept_id)
          setAssessment(detail)
          setResponses({})
          setResults({})
          setMessage('')
          localStorage.removeItem('remindPendingAssessmentId')
        }
      })
      .catch(error => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : 'The generated assessment could not be loaded.')
      })
    return () => { cancelled = true }
  }, [assessmentToOpenId])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (questionTypesRef.current && !questionTypesRef.current.contains(event.target as Node)) {
        setQuestionTypesOpen(false)
      }
    }
    if (questionTypesOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [questionTypesOpen])

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setQuestionTypesOpen(false)
    }
    if (questionTypesOpen) document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [questionTypesOpen])

  const generateAssessment = async () => {
    if (!selectedId) return
    setLoading(true)
    localStorage.remindProviderMode = providerMode
    setMessage(providerMode === 'gemini'
      ? `Generating questions with Gemini (${geminiModel})…`
      : providerMode === 'groq'
        ? `Generating questions with Groq (${groqModel})…`
        : `Generating questions locally with Ollama (${ollamaModel})…`)
    setAssessment(null)
    setResponses({})
    setResults({})
    setQuestionTypesOpen(false)
    const selectedModel = providerMode === 'ollama' ? ollamaModel : (providerMode === 'groq' ? groqModel : geminiModel)
    try {
      const r = await fetch(API + '/assessments', {
        method: 'POST',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concept_id: selectedId,
          question_count: questionCount,
          question_types: questionTypes,
          difficulty: 'medium',
          provider_mode: providerMode,
          model: selectedModel
        })
      })
      const data = await r.json()
      if (r.ok) {
        const detailRes = await fetch(`${API}/assessments/${data.id}`, { headers: headers() })
        if (!detailRes.ok) {
          setMessage('Assessment was created, but its questions could not be loaded. Please open Assessments again.')
          return
        }
        const detail = await detailRes.json()
        if (!Array.isArray(detail.questions) || detail.questions.length === 0) {
          setMessage('Assessment was created, but no questions were returned. Please retry generation.')
          return
        }
        setAssessment(detail)
        setMessage(data.message || (data.ai_fallback_used
          ? 'Gemini was unavailable, so this assessment was generated locally with Ollama.'
          : ''))
        onAssessmentGenerated(data.id)
      } else {
        const detail = data.detail || ''
        setMessage(detail.includes('invalid structured output')
          ? 'The local AI returned an incomplete question set. Please retry; no assessment was saved.'
          : detail || 'Failed to generate questions. Ensure Ollama is running.')
      }
    } catch {
      setMessage('Network error communicating with the selected AI provider.')
    } finally {
      setLoading(false)
    }
  }

  const submitAssessment = async () => {
    const questionIds = assessment?.questions?.map((question: any) => String(question.id)) || []
    const answeredIds = Object.keys(responses)
    const allQuestionsAnswered = questionIds.length > 0
      && questionIds.length === answeredIds.length
      && questionIds.every((id: string) => Object.prototype.hasOwnProperty.call(responses, id))
    if (!assessment || !allQuestionsAnswered) {
      setMessage('Please answer every question before submitting the assessment.')
      return
    }
    setSubmitting(true)
    try {
      const r = await fetch(`${API}/assessments/${assessment.id}/submit`, {
        method: 'POST',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: responses })
      })
      const data = await r.json()
      if (r.ok) {
        setResults(Object.fromEntries(data.results.map((result: any) => [result.question_id, result])))
        setMessage(`Assessment complete: ${data.score}/${data.max_score} correct.`)
        await refresh()
      } else {
        setMessage(data.detail || 'Could not submit assessment.')
      }
    } catch {
      setMessage('Could not submit assessment. Please check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const closeAssessment = () => {
    setAssessment(null)
    setResponses({})
    setResults({})
    setMessage('')
    onCloseAssessment()
  }

  const currentConcept = concepts.find(c => c.id === selectedId)

  return (
    <section className="panel data-page">
      <p className="eyebrow">EVIDENCE-BASED RECALL</p>
      <h3>Concept Assessments</h3>
      {message && <p className="notice">{message}</p>}

      {concepts.length ? (
        <div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'flex', gap: 8, alignItems: 'center' }}>
              Target concept:
              <select
                value={selectedId || ''}
                onChange={e => {
                  setSelectedId(Number(e.target.value))
                  setAssessment(null)
                  setResponses({})
                  setResults({})
                  setMessage('')
                }}
                style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-input)', fontFamily: 'inherit', fontSize: 13 }}
              >
                {concepts.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.topic})</option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'flex', gap: 8, alignItems: 'center' }}>
              Questions:
              <input
                type="number"
                min={5}
                max={20}
                value={questionCount}
                onChange={e => {
                  const value = Number(e.target.value)
                  if (Number.isInteger(value) && value >= 5 && value <= 20) setQuestionCount(value)
                }}
                disabled={loading || !!assessment}
                style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-input)', fontFamily: 'inherit', fontSize: 13 }}
              />
            </label>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'flex', gap: 8, alignItems: 'center' }}>
              AI provider:
              <select
                value={providerMode}
                onChange={e => {
                  const mode = e.target.value as 'gemini' | 'ollama' | 'groq'
                  setProviderMode(mode)
                  localStorage.remindProviderMode = mode
                }}
                disabled={loading || !!assessment}
                aria-label="AI provider for assessment generation"
                style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-input)', fontFamily: 'inherit', fontSize: 13 }}
              >
                <option value="ollama">Ollama (local)</option>
                <option value="gemini">Gemini (cloud)</option>
                <option value="groq">Groq (cloud)</option>
              </select>
            </label>
            {providerMode === 'ollama' && <label style={{ fontSize: 12, fontWeight: 700, display: 'flex', gap: 8, alignItems: 'center' }}>
              Local model:
              {ollamaModel === 'qwen3:4b' && <span className="preferred-model-badge"><Sparkles size={12} /> Preferred</span>}
              <select
                value={ollamaModel}
                onChange={event => { setOllamaModel(event.target.value); localStorage.remindAssessmentModel = event.target.value }}
                disabled={loading || !!assessment || !ollamaAvailable}
                aria-label="Ollama model for assessment generation"
                style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-input)', fontFamily: 'inherit', fontSize: 13 }}
              >
                {ollamaModels.length
                  ? ollamaModels.map(model => <option key={model.id} value={model.id} disabled={!model.installed}>{model.label}{model.installed ? '' : ' (not installed)'}</option>)
                  : <option value={ollamaModel}>{ollamaAvailable ? 'Loading models…' : 'Ollama unavailable'}</option>}
              </select>
            </label>}
            {providerMode === 'groq' && <label style={{ fontSize: 12, fontWeight: 700, display: 'flex', gap: 8, alignItems: 'center' }}>
              Groq model:
              <select
                value={groqModel}
                onChange={event => { setGroqModel(event.target.value); localStorage.remindAssessmentGroqModel = event.target.value }}
                disabled={loading || !!assessment}
                aria-label="Groq model for assessment generation"
                style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-input)', fontFamily: 'inherit', fontSize: 13 }}
              >
                {groqModels.length
                  ? groqModels.map(model => <option key={model.id} value={model.id}>{model.label || model.id}</option>)
                  : (
                    <>
                      <option value="openai/gpt-oss-20b">openai/gpt-oss-20b</option>
                      <option value="qwen/qwen3.8-27b">qwen/qwen3.8-27b</option>
                      <option value="openai/gpt-oss-120b">openai/gpt-oss-120b</option>
                    </>
                  )}
              </select>
            </label>}
            {providerMode === 'gemini' && <label style={{ fontSize: 12, fontWeight: 700, display: 'flex', gap: 8, alignItems: 'center' }}>
              Gemini model:
              <select
                value={geminiModel}
                onChange={event => { setGeminiModel(event.target.value); localStorage.remindAssessmentGeminiModel = event.target.value }}
                disabled={loading || !!assessment || !geminiAvailable}
                aria-label="Gemini model for assessment generation"
                style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-input)', fontFamily: 'inherit', fontSize: 13 }}
              >
                {geminiModels.length
                  ? geminiModels.map(model => <option key={model.id} value={model.id}>{model.label || model.id}</option>)
                  : (
                    <>
                      <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite</option>
                      <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash Lite</option>
                    </>
                  )}
              </select>
            </label>}
            <div className="assessment-type-picker" ref={questionTypesRef}>
              <button
                type="button"
                className="assessment-type-trigger"
                onClick={() => setQuestionTypesOpen(open => !open)}
                disabled={loading || !!assessment}
                aria-expanded={questionTypesOpen}
                aria-haspopup="listbox"
              >
                <span>Question type</span>
                <strong>{questionTypes.length === 2 ? 'Both types' : questionTypes[0] === 'multiple_choice' ? 'Multiple choice' : 'True / False'}</strong>
                <ChevronDown size={15} />
              </button>
              {questionTypesOpen && (
                <div className="assessment-type-menu" role="listbox" aria-label="Question types">
                  {[
                    ['multiple_choice', 'Multiple choice'],
                    ['true_false', 'True / False']
                  ].map(([value, label]) => {
                    const type = value as 'multiple_choice' | 'true_false'
                    return (
                      <label key={value} className="assessment-type-option">
                        <input
                          type="checkbox"
                          checked={questionTypes.includes(type)}
                          onChange={() => {
                            if (questionTypes.length === 1 && questionTypes.includes(type)) return
                            setQuestionTypes(current => current.includes(type)
                              ? current.filter(item => item !== type)
                              : [...current, type])
                          }}
                        />
                        <span>{label}</span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
            <button className="dark-btn" onClick={generateAssessment} disabled={loading || !selectedId}>
              {loading ? <><RotateCw size={14} className="spin" /> Generating…</> : <><Target size={14} /> Generate recall check</>}
            </button>
          </div>
          <p className="provider-note">
            {providerMode === 'ollama'
              ? 'Local mode keeps your study material on this device.'
              : providerMode === 'gemini'
                ? 'Cloud mode sends relevant study material to Gemini for generation.'
                : 'Cloud mode sends relevant study material to Groq for generation.'}
          </p>

          {currentConcept && (
            <div className="theme-surface-muted" style={{ padding: 12, marginBottom: 16, fontSize: 12 }}>
              <b>{currentConcept.name}</b> · Topic: {currentConcept.topic} · Recorded attempts: {currentConcept.attempts} · Decay risk: {currentConcept.decay_risk !== null ? `${currentConcept.decay_risk}%` : 'Unassessed'}
            </div>
          )}

          {assessment && (
            <div>
              <p className="eyebrow" style={{ marginBottom: 10 }}>{assessment.title.toUpperCase()}</p>
              {assessment.questions?.map((q: any, i: number) => {
                const res = results[q.id]
                return (
                  <div key={q.id} className="question-card">
                    <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Question {i + 1} ({q.kind.replace('_', ' ')}):</p>
                    <p style={{ fontSize: 13, lineHeight: 1.6 }}>{q.prompt}</p>

                    {q.kind === 'multiple_choice' && (
                      <div className="question-options">
                        {q.options?.map((opt: string, oi: number) => (
                          <button
                            key={oi}
                            type="button"
                            className={`question-option ${responses[q.id] === opt ? 'selected' : ''}`}
                            onClick={() => !Object.keys(results).length && setResponses(p => ({ ...p, [q.id]: opt }))}
                            disabled={submitting || Object.keys(results).length > 0}
                          >
                            <span>{String.fromCharCode(65 + oi)}.</span> {opt}
                          </button>
                        ))}
                      </div>
                    )}

                    {q.kind === 'true_false' && (
                      <div className="question-options" style={{ gridTemplateColumns: '1fr 1fr' }}>
                        {['True', 'False'].map(opt => (
                          <button
                            key={opt}
                            type="button"
                            className={`question-option ${responses[q.id] === opt ? 'selected' : ''}`}
                            onClick={() => !Object.keys(results).length && setResponses(p => ({ ...p, [q.id]: opt }))}
                            disabled={submitting || Object.keys(results).length > 0}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    )}

                    {res && (
                      <div className={`feedback-box ${res.correct ? 'correct' : 'incorrect'}`}>
                        <b>{res.correct ? '✓ Correct' : '✕ Needs Review'} (Score: {res.score}/1)</b>
                        <p style={{ marginTop: 4 }}>{res.feedback}</p>
                        {res.decay_risk !== undefined && (
                          <small style={{ display: 'block', marginTop: 4, opacity: 0.8 }}>Updated concept decay risk: {res.decay_risk}%</small>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
              <div className="assessment-actions">
                <button
                  className="dark-btn"
                  onClick={submitAssessment}
                  disabled={submitting || Object.keys(results).length > 0 || !assessment.questions.every((question: any) => Object.prototype.hasOwnProperty.call(responses, String(question.id)))}
                >
                  {submitting ? 'Grading assessment…' : 'Submit assessment'}
                </button>
                <button
                  type="button"
                  className="light-btn assessment-close-btn"
                  onClick={closeAssessment}
                >
                  Close assessment
                </button>
              </div>
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
}: {
  d: Dashboard,
  rebuild: () => void,
  rebuilding: boolean,
  notice: string | null,
  upload: () => void,
  onStartAssessment: (conceptId: number) => void
}) {
  const total = d.documents
  const signals = d.signals
  const averageScore = signals?.total_questions
    ? Math.round((signals.correct_answers / signals.total_questions) * 100)
    : null
  return (
    <>
      <section className="hero">
        <div>
          <span className="pill"><Sparkles size={14} /> YOUR LEARNING RHYTHM</span>
          <h1>
            {d.at_risk ? (
              <>You have <i>{d.at_risk} {d.at_risk === 1 ? 'idea' : 'ideas'}</i><br />asking for attention.</>
            ) : (
              <>Let’s build your<br /><i>knowledge rhythm.</i></>
            )}
          </h1>
          <p>
            {total
              ? `You have ${d.processed_documents} processed resource${d.processed_documents === 1 ? '' : 's'} ready to support your next review.`
              : 'Add your first study resource. ReMind will organize it into a learning map—without pretending you know it yet.'
            }
          </p>
          {notice && <p className="notice" style={{ marginBottom: 16 }}>{notice}</p>}
          {total ? (
            <button className="light-btn" onClick={rebuild} disabled={rebuilding}>
              {rebuilding ? (
                <><RotateCw size={15} className="spin" /> Refreshing recommendations…</>
              ) : (
                <>Refresh recommendations <ChevronRight size={16} /></>
              )}
            </button>
          ) : (
            <button className="light-btn" onClick={upload}>
              <FileUp size={16} /> Upload study material
            </button>
          )}
        </div>
        <div className="hero-art">
          <div className="orbit one"></div>
          <div className="orbit two"></div>
          <div className="brain"><BrainCircuit size={48} /></div>
          <span className="dot d1"></span>
          <span className="dot d2"></span>
          <span className="dot d3"></span>
        </div>
      </section>

      <section className="stats">
        <Stat label="Study materials" value={d.documents} note={`${d.processed_documents} indexed`} icon={<Library />} />
        <Stat label="Concepts found" value={d.concepts} note={d.concepts ? 'Awaiting assessment' : 'Upload material to begin'} icon={<BrainCircuit />} />
        <Stat label="Assessed" value={d.assessed_concepts} note="Evidence-based only" icon={<Target />} />
        <Stat label="Needs attention" value={d.at_risk} note="From recall history" icon={<Clock3 />} />
      </section>

      <section className="lower">
        <div className="panel focus">
          <div className="panel-head">
            <div>
              <p className="eyebrow">NEXT UP</p>
              <h3>Your revision queue</h3>
            </div>
            <button onClick={rebuild} disabled={rebuilding}>
              {rebuilding ? <><RotateCw size={12} className="spin" /> Recalculating…</> : 'Recalculate'}
            </button>
          </div>
          {d.recommendations.length ? (
            <div className="queue">
              {d.recommendations.slice(0, 4).map(x => (
                <article
                  key={x.id}
                  className="queue-item"
                  onClick={() => onStartAssessment(x.concept_id)}
                  title="Click to start recall check"
                >
                  <div className="priority">{x.priority}</div>
                  <div>
                    <b>{x.concept}</b>
                    <p>{x.reason}</p>
                  </div>
                  <span>{x.activity}</span>
                  <ChevronRight size={18} />
                </article>
              ))}
            </div>
          ) : (
            <div className="empty">
              <span><Target size={23} /></span>
              <b>No review is due yet</b>
              <p>Assessment evidence is needed before ReMind can estimate retention and make recommendations.</p>
            </div>
          )}
        </div>

        <div className="panel insights">
          <div className="insights-heading">
            <div>
              <p className="eyebrow">LEARNING SIGNALS</p>
              <h3>Your progress at a glance</h3>
              <p className="insights-subtitle">A live view of your completed assessment performance.</p>
            </div>
            <div className="insights-score">
              <strong>{signals?.accuracy ?? '—'}{signals?.accuracy !== null && signals?.accuracy !== undefined ? '%' : ''}</strong>
              <span>overall accuracy</span>
            </div>
          </div>

          <div className="insight-metrics">
            <div><span>Assessments</span><strong>{signals?.total_assessments ?? 0}</strong><small>completed</small></div>
            <div><span>Questions answered</span><strong>{signals?.total_questions ?? 0}</strong><small>{signals?.correct_answers ?? 0} correct</small></div>
            <div><span>Retention stability</span><strong>{signals?.retention_rate ?? '—'}{signals?.retention_rate !== null && signals?.retention_rate !== undefined ? '%' : ''}</strong><small>memory signal</small></div>
          </div>

          <div className="insights-chart-wrap">
            <div className="chart-title"><span>Assessment performance</span><small>Latest {signals?.recent.length ?? 0} assessments</small></div>
            <div className="insights-chart">
              <div className="chart-grid"><i></i><i></i><i></i></div>
              {signals?.recent.length ? signals.recent.map((item, idx) => (
                <div className="chart-column" key={idx}>
                  <div className="chart-value">{item.score}/{item.max_score}</div>
                  <i
                    className={item.correct ? 'chart-bar is-positive' : 'chart-bar'}
                    style={{ height: `${Math.max(item.height, 8)}%` }}
                    title={`Assessment ${idx + 1}: ${item.score}/${item.max_score}`}
                  />
                  <small>#{idx + 1}</small>
                </div>
              )) : (
                <div className="chart-empty">Complete an assessment to start your progress trend.</div>
              )}
            </div>
          </div>

          <div className="insights-footer">
            <span><i className="legend-dot positive"></i>Strong result</span>
            <span><i className="legend-dot"></i>Needs review</span>
            {averageScore !== null && <b>{averageScore}% average across all answers</b>}
          </div>
        </div>
      </section>
    </>
  )
}

function Stat({ label, value, note, icon }: { label: string; value: number | string; note: string; icon: any }) {
  return (
    <article className="stat">
      <span>{icon}</span>
      <p>{label}</p>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function Empty({ tab, upload }: { tab: string; upload: () => void }) {
  return (
    <section className="page-empty">
      <div><BookOpen size={34} /></div>
      <p className="eyebrow">{tab.toUpperCase()}</p>
      <h1>Your {tab.toLowerCase()} starts<br /><i>with your material.</i></h1>
      <p>Add a PDF, DOCX, Markdown, or text file to build your private learning workspace.</p>
      <button className="dark-btn" onClick={upload}>Add study material <ChevronRight size={16} /></button>
    </section>
  )
}

function Root() { return <ErrorBoundary><App /></ErrorBoundary> }

const container = document.getElementById('root')
if (!container) throw new Error('ReMind could not find its root element.')
createRoot(container).render(<Root />)
