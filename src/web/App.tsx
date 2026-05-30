import { useEffect, useMemo, useReducer, useRef, useState, type FormEvent } from 'react';
import type { AccountSummary, AgentSummary, FileReadResult, FileTreeNode, GitStatusSummary, InspectorTab, ServerHealth, SkillSummary, StartTurnRequest, TimelineCard, UiEvent, CodexWebConfig } from '../shared/types.js';
import { api, eventStreamUrl, getStoredToken, setStoredToken } from './lib/api.js';
import { initialState, reduce } from './lib/reducer.js';
import { normalizeAccount } from './lib/normalize.js';
import { Sidebar } from './components/Sidebar.js';
import { Timeline } from './components/Timeline.js';
import { Inspector } from './components/Inspector.js';
import { Composer } from './components/Composer.js';
import { TopBar } from './components/TopBar.js';
import { ApprovalRail } from './components/ApprovalRail.js';
import { ThreadHeader } from './components/ThreadHeader.js';
import { CommandPalette } from './components/CommandPalette.js';
import { ActivityCenter } from './components/ActivityCenter.js';
import { MobileDock } from './components/MobileDock.js';

export function App() {
  const [state, dispatch] = useReducer(reduce, initialState);
  const [busy, setBusy] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(() => !isNarrowViewport());
  const [inspectorVisible, setInspectorVisible] = useState(false);
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsError, setSkillsError] = useState<string | undefined>();
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsError, setAgentsError] = useState<string | undefined>();
  const [account, setAccount] = useState<AccountSummary | undefined>();
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('review');
  const [codexWebConfig, setCodexWebConfig] = useState<CodexWebConfig | undefined>();
  const [health, setHealth] = useState<ServerHealth | undefined>();
  const [authReady, setAuthReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | undefined>();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => window.localStorage.getItem('codex-platform-notifications') === 'true');
  const [fileTree, setFileTree] = useState<FileTreeNode | undefined>();
  const [fileContent, setFileContent] = useState<FileReadResult | undefined>();
  const [gitStatus, setGitStatus] = useState<GitStatusSummary | undefined>();
  const [projectPanelLoading, setProjectPanelLoading] = useState(false);
  const [projectPanelError, setProjectPanelError] = useState<string | undefined>();
  const notifiedApprovals = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        const cfg = await api.config();
        const nextHealth = await api.health().catch(() => undefined);
        if (cancelled) return;
        setCodexWebConfig(cfg);
        setHealth(nextHealth);
        if (!cfg.authRequired) {
          setAuthReady(true);
        } else {
          const stored = getStoredToken();
          if (stored) {
            try {
              await api.login(stored);
              setAuthReady(true);
            } catch {
              setStoredToken('');
              setAuthReady(false);
              setAuthError('Saved Codex-Platform token was rejected. Enter the token again.');
            }
          } else {
            setAuthReady(false);
          }
        }
      } catch (error) {
        if (!cancelled) setAuthError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    }
    void bootstrap();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!authReady) return;
    let closed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;

    const handleAuthError = (error: unknown) => {
      const status = typeof error === 'object' && error && 'status' in error ? (error as { status?: number }).status : undefined;
      if (status === 401) {
        setStoredToken('');
        setAuthReady(false);
        setAuthError('Session token was rejected. Enter the Codex-Platform token again.');
        return true;
      }
      return false;
    };

    api.state()
      .then((snapshot) => dispatch({ type: 'raw', method: 'snapshot', params: snapshot }))
      .catch((error) => {
        if (!handleAuthError(error)) dispatch({ type: 'error', message: error instanceof Error ? error.message : String(error) });
      });

    api.health().then(setHealth).catch(() => undefined);

    const connect = () => {
      socket = new WebSocket(eventStreamUrl());
      socket.onopen = () => dispatch({ type: 'connection.status', connected: true });
      socket.onmessage = (message) => {
        try {
          dispatch(JSON.parse(message.data) as UiEvent);
        } catch (error) {
          dispatch({ type: 'error', message: `Bad websocket event: ${String(error)}` });
        }
      };
      socket.onclose = (event) => {
        if (closed) return;
        dispatch({ type: 'connection.status', connected: false, message: `event stream closed (${event.code || 'unknown'})` });
        reconnectTimer = window.setTimeout(connect, 1500);
      };
      socket.onerror = () => dispatch({ type: 'connection.status', connected: false, message: 'event stream error' });
    };

    connect();
    return () => {
      closed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [authReady]);

  const selectedProject = useMemo(() => state.projects.find((p) => p.id === state.selectedProjectId) ?? state.projects[0], [state.projects, state.selectedProjectId]);
  const projectThreads = useMemo(() => state.threads.filter((thread) => !selectedProject || thread.projectId === selectedProject.id || thread.projectId === 'default'), [state.threads, selectedProject]);
  const selectedThread = useMemo(() => projectThreads.find((t) => t.id === state.selectedThreadId) ?? projectThreads[0], [projectThreads, state.selectedThreadId]);
  const selectedCards = useMemo(() => state.cards.filter((c) => c.threadId === selectedThread?.id), [state.cards, selectedThread?.id]);
  const focusedCard = useMemo(() => selectedCards.find((c) => c.id === state.focusedCardId) ?? selectedCards[selectedCards.length - 1], [selectedCards, state.focusedCardId]);
  const selectedApprovals = useMemo(() => state.approvals.filter((a) => !a.threadId || a.threadId === selectedThread?.id), [state.approvals, selectedThread?.id]);

  useEffect(() => {
    if (!notificationsEnabled || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    for (const approval of state.approvals) {
      const key = String(approval.requestId);
      if (notifiedApprovals.current.has(key)) continue;
      notifiedApprovals.current.add(key);
      new Notification('Codex approval required', {
        body: approval.command || approval.title,
        tag: `codex-approval-${key}`
      });
    }
  }, [notificationsEnabled, state.approvals]);

  useEffect(() => {
    const liveApprovalIds = new Set(state.approvals.map((approval) => String(approval.requestId)));
    for (const key of [...notifiedApprovals.current]) {
      if (!liveApprovalIds.has(key)) notifiedApprovals.current.delete(key);
    }
  }, [state.approvals]);

  useEffect(() => {
    if (!authReady || !selectedProject?.id) return;
    void reloadCapabilities(false);
    void loadAccount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, selectedProject?.id]);

  useEffect(() => {
    if (!authReady || !selectedProject?.id) return;
    void reloadProjectPanels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, selectedProject?.id]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const inEditor = target?.tagName === 'TEXTAREA' || target?.tagName === 'INPUT' || target?.tagName === 'SELECT' || target?.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandPaletteOpen(true);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        setSidebarVisible((value) => !value);
      }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'i') {
        event.preventDefault();
        setInspectorVisible((value) => !value);
      }
      if ((event.metaKey || event.ctrlKey) && event.altKey && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        setInspectorVisible((value) => !value);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') {
        event.preventDefault();
        setInspectorVisible(true);
        setInspectorTab('terminal');
      }
      if (!inEditor && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        void createThread();
      }
      if (event.key === 'Escape') {
        if (commandPaletteOpen) setCommandPaletteOpen(false);
        else if (activityOpen) setActivityOpen(false);
        else dispatch({ type: 'raw', method: 'focus', params: { cardId: undefined } });
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  async function login(token: string) {
    setAuthError(undefined);
    try {
      await api.login(token);
      setAuthReady(true);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    }
  }

  function logout() {
    void api.logout();
    setAuthReady(false);
  }

  async function loadAccount() {
    try {
      setAccount(normalizeAccount(await api.account()));
    } catch {
      setAccount(undefined);
    }
  }

  async function reloadCapabilities(forceReload = true) {
    if (!selectedProject?.id) return;
    setSkillsLoading(true);
    setAgentsLoading(true);
    setSkillsError(undefined);
    setAgentsError(undefined);
    try {
      const [nextSkills, nextAgents] = await Promise.all([
        api.skills(selectedProject.id, forceReload),
        api.agents(selectedProject.id).then((result) => result.data)
      ]);
      setSkills(nextSkills);
      setAgents(nextAgents);
    } catch (error) {
      setSkills([]);
      setAgents([]);
      const message = error instanceof Error ? error.message : String(error);
      setSkillsError(message);
      setAgentsError(message);
    } finally {
      setSkillsLoading(false);
      setAgentsLoading(false);
    }
  }

  async function reloadSkills(forceReload = true) {
    await reloadCapabilities(forceReload);
  }

  async function reloadProjectPanels() {
    if (!selectedProject?.id) return;
    setProjectPanelLoading(true);
    setProjectPanelError(undefined);
    try {
      const [treeResult, gitResult] = await Promise.all([
        api.fileTree(selectedProject.id, '', 3),
        api.gitStatus(selectedProject.id)
      ]);
      setFileTree(treeResult.tree);
      setGitStatus(gitResult);
      setFileContent(undefined);
    } catch (error) {
      setProjectPanelError(error instanceof Error ? error.message : String(error));
    } finally {
      setProjectPanelLoading(false);
    }
  }

  async function selectProjectFile(path: string) {
    if (!selectedProject?.id || !path || path === '.') return;
    setProjectPanelLoading(true);
    setProjectPanelError(undefined);
    try {
      const next = await api.fileRead(selectedProject.id, path);
      setFileContent(next);
      setInspectorVisible(true);
      setInspectorTab('files');
    } catch (error) {
      setProjectPanelError(error instanceof Error ? error.message : String(error));
    } finally {
      setProjectPanelLoading(false);
    }
  }

  async function startReview() {
    if (!selectedThread) return;
    setBusy(true);
    try {
      await api.startReview(selectedThread.id);
      setInspectorVisible(true);
      setInspectorTab('review');
    } catch (error) {
      dispatch({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  }

  async function createThread() {
    if (!selectedProject || busy) return;
    setBusy(true);
    try {
      await api.createThread({ projectId: selectedProject.id });
    } catch (error) {
      dispatch({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  }

  async function addProject(cwd: string, name?: string) {
    setBusy(true);
    try {
      const result = await api.addProject({ cwd, name });
      dispatch({ type: 'project.upserted', project: result.project });
      dispatch({ type: 'raw', method: 'selectProject', params: { projectId: result.project.id } });
    } catch (error) {
      dispatch({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  }

  async function refreshThreads() {
    if (!selectedProject) return;
    try {
      const result = await api.threads(selectedProject.id);
      for (const thread of result.data) dispatch({ type: 'thread.upserted', thread });
    } catch (error) {
      dispatch({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function startTurn(text: string, options: Partial<StartTurnRequest> = {}) {
    if (!selectedProject) return;
    let thread = selectedThread;
    setBusy(true);
    try {
      if (!thread) {
        const created = await api.createThread({ projectId: selectedProject.id });
        thread = created.thread;
        dispatch({ type: 'thread.upserted', thread });
        dispatch({ type: 'raw', method: 'selectProject', params: { projectId: selectedProject.id } });
      }
      await api.startTurn(thread.id, { text, cwd: selectedProject.cwd, ...options });
    } catch (error) {
      dispatch({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  }

  async function selectThread(threadId: string) {
    const thread = state.threads.find((t) => t.id === threadId);
    if (!thread) return;
    try {
      await api.resumeThread(thread.id, thread.projectId || selectedProject?.id || '');
    } catch (error) {
      dispatch({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function approve(requestId: string | number, decision: 'accept' | 'acceptForSession' | 'decline' | 'cancel') {
    try {
      await api.approval(requestId, decision);
    } catch (error) {
      dispatch({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function interrupt() {
    if (!selectedThread) return;
    try {
      await api.interruptTurn(selectedThread.id);
    } catch (error) {
      dispatch({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function toggleNotifications(enabled: boolean) {
    if (!enabled) {
      window.localStorage.removeItem('codex-platform-notifications');
      setNotificationsEnabled(false);
      return;
    }
    if (typeof Notification === 'undefined') {
      dispatch({ type: 'error', message: 'This browser does not support notifications.' });
      return;
    }
    const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    if (permission !== 'granted') {
      dispatch({ type: 'error', message: 'Browser notifications were not granted.' });
      return;
    }
    window.localStorage.setItem('codex-platform-notifications', 'true');
    setNotificationsEnabled(true);
  }

  if (authLoading) return <BootScreen title="Loading Codex-Platform" subtitle="Reading server configuration…" />;
  if (codexWebConfig?.authRequired && !authReady) return <LoginScreen error={authError} onSubmit={login} />;
  if (authError && !codexWebConfig) return <BootScreen title="Codex-Platform unavailable" subtitle={authError} />;

  return (
    <div className={`app-shell ${sidebarVisible ? '' : 'sidebar-hidden'} ${inspectorVisible ? '' : 'inspector-hidden'}`}>
      <TopBar
        project={selectedProject}
        thread={selectedThread}
        connected={state.connected}
        connectionMessage={state.connectionMessage}
        demoMode={state.demoMode || Boolean(codexWebConfig?.demoMode)}
        health={health}
        gitStatus={gitStatus}
        onNewThread={createThread}
        onInterrupt={interrupt}
        onLogout={codexWebConfig?.authRequired ? logout : undefined}
        onOpenReview={() => { setInspectorVisible(true); setInspectorTab('review'); }}
        onOpenActivity={() => setActivityOpen(true)}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        pendingApprovals={state.approvals.length}
        busy={busy}
        sidebarVisible={sidebarVisible}
        inspectorVisible={inspectorVisible}
        onToggleSidebar={() => setSidebarVisible((value) => !value)}
        onToggleInspector={() => setInspectorVisible((value) => !value)}
      />
      <div className="main-grid">
        {sidebarVisible ? (
          <Sidebar
            projects={state.projects}
            threads={state.threads}
            selectedProjectId={selectedProject?.id}
            selectedThreadId={selectedThread?.id}
            onSelectProject={(projectId) => dispatch({ type: 'raw', method: 'selectProject', params: { projectId } })}
            onSelectThread={selectThread}
            onNewThread={createThread}
            onAddProject={(input) => addProject(input.cwd, input.name)}
            onRefreshThreads={refreshThreads}
            onOpenInspectorTab={(tab) => { setInspectorVisible(true); setInspectorTab(tab); }}
          />
        ) : null}
        <main className="thread-column">
          <ThreadHeader project={selectedProject} thread={selectedThread} cards={selectedCards} approvals={selectedApprovals} busy={busy} onInterrupt={interrupt} />
          {!inspectorVisible ? <ApprovalRail approvals={selectedApprovals} onDecision={approve} /> : null}
          <Timeline cards={selectedCards} focusedCardId={state.focusedCardId} projectName={selectedProject?.name} onFocus={(cardId) => { dispatch({ type: 'raw', method: 'focus', params: { cardId } }); const card = selectedCards.find((item) => item.id === cardId); const tab = tabForCard(card); if (tab) setInspectorTab(tab); }} />
          <Composer
            disabled={!selectedProject || busy}
            onSubmit={startTurn}
            selectedThread={selectedThread}
            skills={skills}
            agents={agents}
            skillsLoading={skillsLoading}
            agentsLoading={agentsLoading}
            skillsError={skillsError}
            agentsError={agentsError}
            codexWebConfig={codexWebConfig}
            onReloadSkills={() => reloadSkills(true)}
          />
        </main>
        {inspectorVisible ? (
          <Inspector
            card={focusedCard}
            cards={selectedCards}
            approvals={selectedApprovals}
            project={selectedProject}
            thread={selectedThread}
            errors={state.errors}
            skills={skills}
            agents={agents}
            skillsLoading={skillsLoading}
            agentsLoading={agentsLoading}
            account={account}
            health={health}
            codexWebConfig={codexWebConfig}
            notificationsEnabled={notificationsEnabled}
            notificationsSupported={typeof Notification !== 'undefined'}
            fileTree={fileTree}
            fileContent={fileContent}
            gitStatus={gitStatus}
            projectPanelLoading={projectPanelLoading}
            projectPanelError={projectPanelError}
            onSelectFile={(path) => void selectProjectFile(path)}
            onRefreshProjectPanels={() => void reloadProjectPanels()}
            onStartReview={() => void startReview()}
            onToggleNotifications={(enabled) => void toggleNotifications(enabled)}
            tab={inspectorTab}
            onTabChange={setInspectorTab}
            onRefreshSkills={() => reloadSkills(true)}
            onDecision={approve}
          />
        ) : null}
      </div>
      <CommandPalette
        open={commandPaletteOpen}
        projects={state.projects}
        threads={state.threads}
        selectedProjectId={selectedProject?.id}
        selectedThreadId={selectedThread?.id}
        onClose={() => setCommandPaletteOpen(false)}
        onNewThread={createThread}
        onRefreshThreads={refreshThreads}
        onReloadSkills={() => reloadSkills(true)}
        onSelectProject={(projectId) => dispatch({ type: 'raw', method: 'selectProject', params: { projectId } })}
        onSelectThread={selectThread}
        onOpenInspectorTab={(tab) => { setInspectorVisible(true); setInspectorTab(tab); }}
        onToggleSidebar={() => setSidebarVisible((value) => !value)}
        onToggleInspector={() => setInspectorVisible((value) => !value)}
        onOpenActivity={() => setActivityOpen(true)}
        onLogout={codexWebConfig?.authRequired ? logout : undefined}
      />
      <ActivityCenter
        open={activityOpen}
        approvals={state.approvals}
        threads={state.threads}
        cards={state.cards}
        errors={state.errors}
        selectedThreadId={selectedThread?.id}
        onClose={() => setActivityOpen(false)}
        onSelectThread={selectThread}
        onDecision={approve}
        onOpenInspectorTab={(tab) => { setInspectorVisible(true); setInspectorTab(tab); setActivityOpen(false); }}
      />
      <MobileDock
        approvalCount={state.approvals.length}
        onThreads={() => { setSidebarVisible(true); setInspectorVisible(false); }}
        onChat={() => { setSidebarVisible(false); setInspectorVisible(false); }}
        onReview={() => { setSidebarVisible(false); setInspectorVisible(true); setInspectorTab('review'); }}
        onActivity={() => setActivityOpen(true)}
        onNewThread={createThread}
      />
    </div>
  );
}

function isNarrowViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 820px)').matches;
}

function BootScreen({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="boot-screen">
      <div className="login-panel">
        <div className="brand-mark large">CP</div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
    </div>
  );
}

function LoginScreen(props: { error?: string; onSubmit: (token: string) => Promise<void> }) {
  const [token, setToken] = useState(getStoredToken());
  const [submitting, setSubmitting] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token.trim()) return;
    setSubmitting(true);
    try {
      await props.onSubmit(token.trim());
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <div className="boot-screen">
      <form className="login-panel" onSubmit={(event) => void submit(event)}>
        <div className="brand-mark large">CP</div>
        <h1>Codex-Platform</h1>
        <p>This deployment requires a Codex-Platform token before it can control the Codex runtime.</p>
        <input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="CODEX_PLATFORM_AUTH_TOKEN" autoFocus />
        {props.error ? <div className="error-line">{props.error}</div> : null}
        <button className="primary" disabled={submitting || !token.trim()}>{submitting ? 'Checking…' : 'Unlock Codex-Platform'}</button>
      </form>
    </div>
  );
}

function tabForCard(card?: TimelineCard): InspectorTab | undefined {
  if (!card) return undefined;
  if (card.kind === 'command') return 'terminal';
  if (card.kind === 'fileChange') return 'diff';
  if (card.kind === 'plan' || card.kind === 'reasoning') return 'plan';
  return 'review';
}
