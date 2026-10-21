import { Component, ReactNode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AlertCircle, AlertTriangle, BookOpen, BrainCircuit, ChartNoAxesCombined, CheckCircle2, ChevronRight, Clock3, FileUp, Grid2X2, HardDrive, Library, Lock, Menu, Moon, MoreHorizontal, Plus, RotateCw, Settings, Shield, Sparkles, Sun, Target, Trash2, User, X } from 'lucide-react'
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
  total_attempts: number
  correct_attempts: number
  accuracy: number | null
  retention_rate: number | null
  recent: { score: number; height: number; correct: boolean; date: string }[]
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
  render() { return this.state.error ? <main className="gate"><div className="logo"><span>r</span> ReMind</div><h1>Something prevented<br /><i>the interface from loading.</i></h1><p className="lead">Please refresh this page. If it persists, start the frontend with <code>npm run dev</code> from the frontend folder.</p></main> : this.props.children }
}

type FontScale = 'sm' | 'md' | 'lg' | 'xl'

function applyTheme(theme: 'light' | 'dark') { document.documentElement.setAttribute('data-theme', theme) }
function applyScale(scale: FontScale) { document.documentElement.setAttribute('data-fscale', scale) }

function App() {
  const [token, setToken] = useState(localStorage.remindToken || '')
  const [user, setUser] = useState<UserProfile | null>(null)
  const [data, setData] = useState<Dashboard>(demo)
  const [tab, setTab] = useState('Overview')
  const [drawer, setDrawer] = useState(false)
  const [rebuilding, setRebuilding] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [selectedConceptId, setSelectedConceptId] = useState<number | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [profileModalOpen, setProfileModalOpen] = useState(false)
  const [profileModalTab, setProfileModalTab] = useState<'profile' | 'workspace' | 'stats' | 'security'>('profile')
  const [theme, setTheme] = useState<'light' | 'dark'>((localStorage.remindTheme || 'light') as 'light' | 'dark')
  const [fscale, setFscale] = useState<FontScale>((localStorage.remindScale || 'md') as FontScale)
  const file = useRef<HTMLInputElement>(null)
  const workspaceRef = useRef<HTMLDivElement>(null)

  // Apply theme + scale on mount and change
  useEffect(() => { applyTheme(theme); localStorage.remindTheme = theme }, [theme])
  useEffect(() => { applyScale(fscale); localStorage.remindScale = fscale }, [fscale])

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light')

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

  const handleSignOut = () => {
    localStorage.removeItem('remindToken')
    setToken('')
    setUser(null)
    setProfileMenuOpen(false)
    setProfileModalOpen(false)
  }

  const rebuild = async () => {
    if (!token || rebuilding) return
    setRebuilding(true)
    try {
      const r = await fetch(API + '/revisions/rebuild', { method: 'POST', headers: headers() })
      if (r.ok) {
        const body = await r.json()
        await load()
        setNotice(body.message || 'Recommendations refreshed successfully.')
        setTimeout(() => setNotice(null), 4500)
      } else {
        const err = await r.json().catch(() => ({}))
        alert(err.detail || 'Could not refresh recommendations.')
      }
    } catch {
      alert('Could not connect to backend server.')
    } finally {
      setRebuilding(false)
    }
  }

  const startAssessmentForConcept = (cid: number) => {
    setSelectedConceptId(cid)
    setTab('Assessments')
  }

  const authenticate = async (email: string, password: string, mode: 'login' | 'register') => {
    const r = await fetch(API + `/auth/${mode === 'login' ? 'login' : 'register'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
    const body = await r.json()
    if (!r.ok) throw new Error(body.detail || 'Could not sign in.')
    localStorage.remindToken = body.access_token
    setToken(body.access_token)
    if (body.user) setUser(body.user)
  }

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let f = e.target.files?.[0]
    if (!f || !token) return
    let form = new FormData()
    form.append('file', f)
    let r = await fetch(API + '/documents', { method: 'POST', headers: headers(), body: form })
    if (r.ok) {
      await load()
      alert('Document processed and indexed.')
      await rebuild()
    } else alert((await r.json()).detail || 'Upload failed')
  }

  const nav = ['Overview', 'My Library', 'Knowledge Map', 'Assessments', 'Revision Center', 'Analytics']
  if (!token) return <LoginPage authenticate={authenticate} />
  const shared = { token, headers, refresh: load }

  const scaleLabels: FontScale[] = ['sm', 'md', 'lg', 'xl']
  const scaleFull: { [k in FontScale]: string } = { sm: 'Small', md: 'Default', lg: 'Large', xl: 'X-Large' }

  return (
    <div className="app">
      <aside className={drawer ? 'open' : ''}>
        <div className="brand"><span>r</span> ReMind</div>
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
            const I = [Grid2X2, Library, BrainCircuit, BookOpen, Target, ChartNoAxesCombined][i]
            return (
              <button key={n} className={tab === n ? 'selected' : ''} onClick={() => { setTab(n); setDrawer(false); setSettingsOpen(false) }}>
                <I size={18} />
                {n}
                {n === 'Revision Center' && data.recommendations.length > 0 ? <em>{data.recommendations.length}</em> : null}
              </button>
            )
          })}
        </nav>
        <div className="side-foot">
          <button className={`settings-gear${settingsOpen ? ' open' : ''}`} onClick={() => setSettingsOpen(o => !o)}>
            <Settings size={16} />
            Appearance
          </button>
          <button onClick={handleSignOut}>Sign out</button>
        </div>

        {settingsOpen && (
          <div className="settings-panel">
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
            <p className="label" style={{ marginTop: 12 }}>Font size</p>
            <div className="settings-row">
              {scaleLabels.map(s => (
                <button
                  key={s}
                  className={`settings-btn${fscale === s ? ' active' : ''}`}
                  onClick={() => setFscale(s)}
                  title={scaleFull[s]}
                >{scaleFull[s]}</button>
              ))}
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
            <button
              className="user-profile-btn"
              onClick={() => { setProfileModalTab('profile'); setProfileModalOpen(true); }}
              title="Open User Profile & Personal Workspace"
            >
              <span className="avatar-sm">
                {user?.display_name ? user.display_name[0].toUpperCase() : (user?.email ? user.email[0].toUpperCase() : 'U')}
              </span>
              <span className="user-profile-name">{user?.display_name || user?.email?.split('@')[0] || 'Profile'}</span>
            </button>
            <button className="upload" onClick={() => file.current?.click()}><Plus size={17} />Add material</button>
          </div>
          <input ref={file} onChange={upload} type="file" accept=".pdf,.docx,.txt,.md" hidden />
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
          <LibraryPage {...shared} />
        ) : tab === 'Knowledge Map' ? (
          <GraphPage {...shared} />
        ) : tab === 'Assessments' ? (
          <AssessmentsPage {...shared} initialConceptId={selectedConceptId} />
        ) : tab === 'Revision Center' ? (
          <RevisionCenterPage {...shared} onStartAssessment={startAssessmentForConcept} />
        ) : tab === 'Analytics' ? (
          <AnalyticsPage {...shared} />
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
        onNavigateTab={t => { setTab(t); setDrawer(false); }}
      />
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
        .catch(() => {})
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
                  placeholder="e.g. Umesh B or Learner"
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
                  <span>Total Assessment Attempts</span>
                  <strong>{dashboardData.signals?.total_attempts ?? 0}</strong>
                  <small style={{ color: 'var(--text-muted)' }}>{dashboardData.signals?.correct_attempts ?? 0} successful recalls</small>
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
        <div className="logo"><span>r</span> ReMind</div>
        <p className="eyebrow">THE PERSONAL LEARNING SYSTEM</p>
        <h1>Make your knowledge<br /><i>stay with you.</i></h1>
        <p className="lead">A private study space that brings the right ideas back at the right moment.</p>
        <p className="fine">Private by design · Local AI · Your material stays yours</p>
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

function LibraryPage({ headers, refresh }: { headers: () => Record<string, string>, refresh: () => Promise<void> }) {
  const [docs, setDocs] = useState<any[]>([])
  const [message, setMessage] = useState('')
  const [deleting, setDeleting] = useState<number | null>(null)

  const load = async () => {
    let r = await fetch(API + '/documents', { headers: headers() })
    if (r.ok) setDocs(await r.json())
  }
  useEffect(() => { load() }, [])

  const action = async (id: number, path: string) => {
    setMessage('Working with local AI…')
    let r = await fetch(`${API}/documents/${id}/${path}`, { method: 'POST', headers: headers() })
    let b = await r.json()
    setMessage(r.ok ? `${path === 'retry' ? 'Indexed' : `Added ${b.concepts_added || 0} concepts`} successfully.` : b.detail || 'Action failed. Start Ollama and try again.')
    await load()
    await refresh()
  }

  const deleteDoc = async (id: number, name: string) => {
    if (!window.confirm(`Delete "${name}"?\n\nThis will permanently remove the document and all related concepts, revision queue items, assessments, and learning history for this material. This cannot be undone.`)) return
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
              onClick={() => deleteDoc(d.id, d.name)}
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
    </section>
  )
}

function GraphPage({ headers }: { headers: () => Record<string, string> }) {
  const [graph, setGraph] = useState<{ nodes: any[], edges: any[] }>({ nodes: [], edges: [] })
  useEffect(() => {
    fetch(API + '/knowledge-graph', { headers: headers() }).then(r => r.ok ? r.json() : null).then(x => x && setGraph(x))
  }, [])

  return (
    <section className="panel data-page">
      <p className="eyebrow">SOURCE-GROUNDED STRUCTURE</p>
      <h3>Knowledge map</h3>
      {graph.nodes.length ? <>
        <div className="graph-list">
          {graph.nodes.map(n => (
            <article key={n.id}>
              <span className={n.assessed ? 'node assessed' : 'node'}></span>
              <div>
                <b>{n.label}</b>
                <p>{n.topic} · {n.assessed ? `risk ${n.risk ?? 'unknown'}%` : 'Not assessed'}</p>
              </div>
            </article>
          ))}
        </div>
        <p className="fine">{graph.edges.length} evidence-backed relationship{graph.edges.length === 1 ? '' : 's'} stored.</p>
      </> : (
        <div className="empty">
          <b>No concepts to map</b>
          <p>Upload material, then choose “Extract concepts” in My Library while Ollama is running.</p>
        </div>
      )}
    </section>
  )
}

function AnalyticsPage({ headers }: { headers: () => Record<string, string> }) {
  const [stats, setStats] = useState<any>()
  useEffect(() => {
    fetch(API + '/analytics', { headers: headers() }).then(r => r.ok ? r.json() : null).then(setStats)
  }, [])

  return (
    <section className="panel data-page">
      <p className="eyebrow">RECORDED EVIDENCE</p>
      <h3>Learning analytics</h3>
      {stats ? (
        <>
          <div className="stats">
            <Stat label="Answer attempts" value={stats.sample_size} note="Recorded submissions" icon={<BookOpen />} />
            <Stat label="Accuracy" value={stats.accuracy === null ? '—' : `${Math.round(stats.accuracy * 100)}%`} note="Observed, not predicted" icon={<Target />} />
            <Stat label="Revision completion" value={stats.revision_completion_rate === null ? '—' : `${Math.round(stats.revision_completion_rate * 100)}%`} note="Completed recommendations" icon={<Clock3 />} />
          </div>
          {stats.attempts && stats.attempts.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <p className="eyebrow">ASSESSMENT ATTEMPTS LOG</p>
              <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                {stats.attempts.map((att: any, i: number) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#fafcfa', border: '1px solid #edf0eb', borderRadius: 8, fontSize: 12 }}>
                    <span>Check #{i + 1} · {new Date(att.at).toLocaleString()}</span>
                    <span className={`badge ${att.score ? 'completed' : 'snoozed'}`}>
                      {att.score ? '✓ Correct (1/1)' : '✕ Needs Review (0/1)'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
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
  onStartAssessment
}: {
  headers: () => Record<string, string>,
  refresh: () => Promise<void>,
  onStartAssessment: (id: number) => void
}) {
  const [revisions, setRevisions] = useState<any[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

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
    setMsg('Recalculating revision queue…')
    try {
      const r = await fetch(API + '/revisions/rebuild', { method: 'POST', headers: headers() })
      const data = await r.json()
      setMsg(data.message || 'Revision recommendations updated.')
      await load()
      await refresh()
    } catch {
      setMsg('Failed to recalculate.')
    } finally {
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
          {busy ? <><RotateCw size={13} className="spin" /> Recalculating…</> : 'Recalculate queue'}
        </button>
      </div>
      {msg && <p className="notice">{msg}</p>}
      {revisions.length ? (
        revisions.map(r => (
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
}: {
  headers: () => Record<string, string>,
  refresh: () => Promise<void>,
  initialConceptId?: number | null
}) {
  const [concepts, setConcepts] = useState<any[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(initialConceptId || null)
  const [assessment, setAssessment] = useState<any>(null)
  const [responses, setResponses] = useState<Record<number, string>>({})
  const [results, setResults] = useState<Record<number, any>>({})
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState<number | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetch(API + '/concepts', { headers: headers() })
      .then(r => r.ok ? r.json() : [])
      .then(list => {
        setConcepts(list)
        if (!selectedId && list.length > 0) setSelectedId(list[0].id)
      })
  }, [])

  useEffect(() => {
    if (initialConceptId) setSelectedId(initialConceptId)
  }, [initialConceptId])

  const generateAssessment = async () => {
    if (!selectedId) return
    setLoading(true)
    setMessage('Generating questions with local Ollama…')
    setAssessment(null)
    setResponses({})
    setResults({})
    try {
      const r = await fetch(API + '/assessments', {
        method: 'POST',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ concept_id: selectedId, question_count: 3, difficulty: 'medium' })
      })
      const data = await r.json()
      if (r.ok) {
        const detailRes = await fetch(`${API}/assessments/${data.id}`, { headers: headers() })
        if (detailRes.ok) setAssessment(await detailRes.json())
        else setAssessment(data)
        setMessage('')
      } else {
        setMessage(data.detail || 'Failed to generate questions. Ensure Ollama is running.')
      }
    } catch {
      setMessage('Network error communicating with Ollama service.')
    } finally {
      setLoading(false)
    }
  }

  const submitAnswer = async (questionId: number) => {
    const resp = responses[questionId]
    if (!resp) return
    setSubmitting(questionId)
    try {
      const r = await fetch(`${API}/questions/${questionId}/answer`, {
        method: 'POST',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: resp })
      })
      const data = await r.json()
      if (r.ok) {
        setResults(prev => ({ ...prev, [questionId]: data }))
        await refresh()
      } else {
        alert(data.detail || 'Grading failed.')
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
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'flex', gap: 8, alignItems: 'center' }}>
              Target concept:
              <select
                value={selectedId || ''}
                onChange={e => setSelectedId(Number(e.target.value))}
                style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #dce4da', fontFamily: 'inherit', fontSize: 13 }}
              >
                {concepts.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.topic})</option>
                ))}
              </select>
            </label>
            <button className="dark-btn" onClick={generateAssessment} disabled={loading || !selectedId}>
              {loading ? <><RotateCw size={14} className="spin" /> Generating with local AI…</> : <><Target size={14} /> Generate recall check</>}
            </button>
          </div>

          {currentConcept && (
            <div style={{ background: '#fafbfa', border: '1px solid #edf0eb', borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 12 }}>
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
                            onClick={() => !res && setResponses(p => ({ ...p, [q.id]: opt }))}
                            disabled={!!res}
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
                            onClick={() => !res && setResponses(p => ({ ...p, [q.id]: opt }))}
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
                        value={responses[q.id] || ''}
                        onChange={e => !res && setResponses(p => ({ ...p, [q.id]: e.target.value }))}
                        disabled={!!res}
                      />
                    )}

                    {!res ? (
                      <button
                        className="dark-btn"
                        style={{ marginTop: 8 }}
                        onClick={() => submitAnswer(q.id)}
                        disabled={!responses[q.id] || submitting === q.id}
                      >
                        {submitting === q.id ? 'Grading…' : 'Submit response'}
                      </button>
                    ) : (
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
          {notice && <p className="notice" style={{ background: '#ffffffb0', marginBottom: 16, border: '1px solid #c9dec2' }}>{notice}</p>}
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
          <p className="eyebrow">LEARNING SIGNALS</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h3>Built from evidence,<br />not guesses.</h3>
            {d.signals && d.signals.accuracy !== null && (
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 24, fontWeight: 800, color: '#bde574', letterSpacing: -0.8 }}>{d.signals.accuracy}%</span>
                <span style={{ display: 'block', fontSize: 10, color: '#a2b5ad', marginTop: -3 }}>accuracy</span>
              </div>
            )}
          </div>
          <div className="signal">
            <div className="bar" style={{ display: 'flex', gap: 8, alignItems: 'flex-end', minHeight: 67 }}>
              {d.signals && d.signals.recent && d.signals.recent.length > 0 ? (
                d.signals.recent.map((item, idx) => (
                  <i
                    key={idx}
                    style={{
                      height: `${item.height}%`,
                      background: item.correct ? '#bde574' : '#e07a5f',
                      flex: 1,
                      minWidth: 14,
                      maxWidth: 24,
                      borderRadius: '3px 3px 0 0',
                      transition: 'height 0.3s ease'
                    }}
                    title={`Check ${idx + 1}: ${item.correct ? 'Correct (1/1)' : 'Incorrect (0/1)'}`}
                  />
                ))
              ) : (
                <>
                  <i style={{ height: '24%', opacity: 0.25 }}></i>
                  <i style={{ height: '48%', opacity: 0.25 }}></i>
                  <i style={{ height: '32%', opacity: 0.25 }}></i>
                  <i style={{ height: '65%', opacity: 0.25 }}></i>
                  <i style={{ height: '42%', opacity: 0.25 }}></i>
                </>
              )}
            </div>
            {d.signals && d.signals.total_attempts > 0 ? (
              <small>
                {d.signals.correct_attempts} of {d.signals.total_attempts} checks correct ({d.signals.accuracy}% observed accuracy).
                {d.signals.retention_rate !== null ? ` Retention stability: ${d.signals.retention_rate}%.` : ''}
              </small>
            ) : (
              <small>Your retention trend will appear after completed assessments.</small>
            )}
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
