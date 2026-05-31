import { useEffect, useMemo, useReducer, useRef, useState, type FormEvent } from 'react';
import type { AccountSummary, AgentSummary, AdminStatus, ApprovalRecord, FileReadResult, FileTreeNode, GitDiffResult, GitHubActionsSummary, GitHubPullRequestSummary, GitOperationRecord, GitStatusSummary, InspectorTab, ManagementTab, ServerHealth, SkillSummary, StartTurnRequest, TimelineCard, UiEvent, CodexWebConfig } from '../shared/types.js';
import { api, eventStreamUrl, getStoredToken, setStoredToken } from './lib/api.js';
import { initialState, reduce } from './lib/reducer.js';
import { normalizeAccount } from './lib/normalize.js';
import { Sidebar } from './components/Sidebar.js';
import { Timeline } from './components/Timeline.js';
import { Inspector } from './components/Inspector.js';
import { Composer, type ComposerCapabilitySelection, type ComposerDraftSelection } from './components/Composer.js';
import { TopBar } from './components/TopBar.js';
import { ApprovalRail } from './components/ApprovalRail.js';
import { ThreadHeader } from './components/ThreadHeader.js';
import { CommandPalette } from './components/CommandPalette.js';
import { ActivityCenter } from './components/ActivityCenter.js';
import { MobileDock } from './components/MobileDock.js';
import { ManagementDrawer } from './components/ManagementDrawer.js';

export function App() {
  const [state, dispatch] = useReducer(reduce, initialState);
  const [busy, setBusy] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(() => !isNarrowViewport());
  const [inspectorVisible, setInspectorVisible] = useState(() => !isNarrowViewport());
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
  const [adminStatus, setAdminStatus] = useState<AdminStatus | undefined>();
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | undefined>();
  const [authReady, setAuthReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | undefined>();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [managementOpen, setManagementOpen] = useState(false);
  const [managementTab, setManagementTab] = useState<ManagementTab>('skills');
  const [composerCapabilitySelection, setComposerCapabilitySelection] = useState<ComposerCapabilitySelection | undefined>();
  const [composerDraftSelection, setComposerDraftSelection] = useState<ComposerDraftSelection | undefined>();
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => window.localStorage.getItem('codex-platform-notifications') === 'true');
  const [fileTree, setFileTree] = useState<FileTreeNode | undefined>();
  const [fileContent, setFileContent] = useState<FileReadResult | undefined>();
  const [gitStatus, setGitStatus] = useState<GitStatusSummary | undefined>();
  const [gitDiff, setGitDiff] = useState<GitDiffResult | undefined>();
  const [githubActions, setGithubActions] = useState<GitHubActionsSummary | undefined>();
  const [githubPullRequests, setGithubPullRequests] = useState<GitHubPullRequestSummary | undefined>();
  const [selectedGitPath, setSelectedGitPath] = useState<string | undefined>();
  const [gitActionBusy, setGitActionBusy] = useState(false);
  const [gitActionMessage, setGitActionMessage] = useState<string | undefined>();
  const [projectPanelLoading, setProjectPanelLoading] = useState(false);
  const [projectPanelError, setProjectPanelError] = useState<string | undefined>();
  const [browserFeedback, setBrowserFeedback] = useState('');
  const [artifactFeedback, setArtifactFeedback] = useState('');
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
  const selectedApprovalHistory = useMemo(() => filterApprovalHistory(state.approvalHistory, selectedThread?.id), [state.approvalHistory, selectedThread?.id]);
  const selectedGitOperations = useMemo(() => filterGitOperations(state.gitOperations, selectedProject?.id), [state.gitOperations, selectedProject?.id]);

  useEffect(() => {
    setBrowserFeedback('');
    setArtifactFeedback('');
  }, [selectedProject?.id, selectedThread?.id]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 820px)');
    const onChange = (event: MediaQueryListEvent) => {
      if (!event.matches) return;
      setSidebarVisible(false);
      setInspectorVisible(false);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (selectedApprovals.length === 0 || isNarrowViewport()) return;
    setInspectorVisible(true);
    setInspectorTab('review');
  }, [selectedApprovals.length]);

  function openManagementTab(tab: ManagementTab) {
    setManagementTab(tab);
    setManagementOpen(true);
  }

  function useComposerCapability(kind: ComposerCapabilitySelection['kind'], name: string) {
    setComposerCapabilitySelection({ requestId: Date.now(), kind, name });
    setManagementOpen(false);
  }

  function useComposerDraft(handoff: { prompt: string; threadId?: string; agentName?: string }) {
    if (handoff.threadId && handoff.threadId !== selectedThread?.id) {
      const thread = state.threads.find((item) => item.id === handoff.threadId);
      if (thread?.projectId && thread.projectId !== selectedProject?.id && thread.projectId !== 'default') {
        dispatch({ type: 'raw', method: 'selectProject', params: { projectId: thread.projectId } });
      }
      dispatch({ type: 'thread.selected', threadId: handoff.threadId });
      if (thread) {
        void api.resumeThread(thread.id, thread.projectId || selectedProject?.id || '').catch((error) => {
          dispatch({ type: 'error', message: errorMessage(error) });
        });
      }
    }
    setComposerDraftSelection({ requestId: Date.now(), prompt: handoff.prompt, agentName: handoff.agentName });
    setManagementOpen(false);
    if (isNarrowViewport()) {
      setSidebarVisible(false);
      setInspectorVisible(false);
    }
  }

  function focusCard(cardId: string, openInspector = true, knownCard?: TimelineCard) {
    dispatch({ type: 'raw', method: 'focus', params: { cardId } });
    const card = knownCard ?? selectedCards.find((item) => item.id === cardId);
    const tab = tabForCard(card);
    if (tab) setInspectorTab(tab);
    if (openInspector && card) setInspectorVisible(true);
  }

  function focusApproval(approval: { itemId?: string; kind?: string }) {
    if (approval.itemId) {
      dispatch({ type: 'raw', method: 'focus', params: { cardId: approval.itemId } });
    }
    setInspectorVisible(true);
    setInspectorTab('review');
  }

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
    if (!authReady) return;
    void reloadAdminStatus();
  }, [authReady]);

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

  async function reloadAdminStatus() {
    setAdminLoading(true);
    setAdminError(undefined);
    try {
      setAdminStatus(await api.adminStatus());
    } catch (error) {
      setAdminStatus(undefined);
      setAdminError(errorMessage(error));
    } finally {
      setAdminLoading(false);
    }
  }

  async function reloadCapabilities(forceReload = true) {
    if (!selectedProject?.id) return;
    setSkillsLoading(true);
    setAgentsLoading(true);
    setSkillsError(undefined);
    setAgentsError(undefined);
    const [skillsResult, agentsResult] = await Promise.allSettled([
      api.skills(selectedProject.id, forceReload),
      api.agents(selectedProject.id).then((result) => result.data)
    ]);
    if (skillsResult.status === 'fulfilled') {
      setSkills(skillsResult.value);
    } else {
      setSkills([]);
      setSkillsError(errorMessage(skillsResult.reason));
    }
    if (agentsResult.status === 'fulfilled') {
      setAgents(agentsResult.value);
    } else {
      setAgents([]);
      setAgentsError(errorMessage(agentsResult.reason));
    }
    setSkillsLoading(false);
    setAgentsLoading(false);
  }

  async function reloadSkills(forceReload = true) {
    await reloadCapabilities(forceReload);
  }

  async function reloadProjectPanels() {
    if (!selectedProject?.id) return;
    setProjectPanelLoading(true);
    setProjectPanelError(undefined);
    try {
      const [treeResult, gitResult, actionsResult, pullRequestResult] = await Promise.all([
        api.fileTree(selectedProject.id, '', 3),
        api.gitStatus(selectedProject.id),
        api.githubActions(selectedProject.id).catch((error): GitHubActionsSummary => ({
          state: 'unavailable',
          runs: [],
          error: errorMessage(error),
          fetchedAt: Date.now()
        })),
        api.githubPullRequests(selectedProject.id).catch((error): GitHubPullRequestSummary => ({
          state: 'unavailable',
          pulls: [],
          error: errorMessage(error),
          fetchedAt: Date.now()
        }))
      ]);
      setFileTree(treeResult.tree);
      setGitStatus(gitResult);
      setGithubActions(actionsResult);
      setGithubPullRequests(pullRequestResult);
      setFileContent(undefined);
      const nextGitFile = gitResult.files.find((file) => file.path === selectedGitPath) ?? gitResult.files[0];
      setSelectedGitPath(nextGitFile?.path);
      if (nextGitFile) {
        const cached = nextGitFile.index.trim() !== '' && nextGitFile.index !== '?' && (nextGitFile.workingTree.trim() === '');
        setGitDiff(await api.gitDiff(selectedProject.id, nextGitFile.path, cached));
      } else {
        setGitDiff(undefined);
      }
    } catch (error) {
      setProjectPanelError(error instanceof Error ? error.message : String(error));
      setGithubActions(undefined);
      setGithubPullRequests(undefined);
    } finally {
      setProjectPanelLoading(false);
    }
  }

  async function selectGitFile(path: string, cached = false) {
    if (!selectedProject?.id || !path) return;
    setSelectedGitPath(path);
    setProjectPanelLoading(true);
    setProjectPanelError(undefined);
    try {
      const next = await api.gitDiff(selectedProject.id, path, cached);
      setGitDiff(next);
      setInspectorVisible(true);
      setInspectorTab('git');
    } catch (error) {
      setGitDiff(undefined);
      setProjectPanelError(error instanceof Error ? error.message : String(error));
    } finally {
      setProjectPanelLoading(false);
    }
  }

  async function runGitAction(action: 'stage' | 'unstage', paths: string[]) {
    if (!selectedProject?.id || paths.length === 0) return;
    setGitActionBusy(true);
    setProjectPanelError(undefined);
    setGitActionMessage(undefined);
    try {
      const result = action === 'stage' ? await api.gitStage(selectedProject.id, paths) : await api.gitUnstage(selectedProject.id, paths);
      setGitStatus(result.status);
      const nextGitFile = result.status.files.find((file) => file.path === selectedGitPath) ?? result.status.files[0];
      setSelectedGitPath(nextGitFile?.path);
      if (nextGitFile) {
        const cached = nextGitFile.index.trim() !== '' && nextGitFile.index !== '?' && (nextGitFile.workingTree.trim() === '');
        setGitDiff(await api.gitDiff(selectedProject.id, nextGitFile.path, cached));
      } else {
        setGitDiff(undefined);
      }
      setGitActionMessage(action === 'stage' ? `Staged ${paths.length} file${paths.length === 1 ? '' : 's'}.` : `Unstaged ${paths.length} file${paths.length === 1 ? '' : 's'}.`);
    } catch (error) {
      setProjectPanelError(error instanceof Error ? error.message : String(error));
    } finally {
      setGitActionBusy(false);
    }
  }

  async function commitGit(message: string, paths?: string[]) {
    if (!selectedProject?.id) return;
    setGitActionBusy(true);
    setProjectPanelError(undefined);
    setGitActionMessage(undefined);
    try {
      const result = await api.gitCommit(selectedProject.id, message, paths);
      setGitStatus(result.status);
      setGitDiff(undefined);
      setSelectedGitPath(undefined);
      setGitActionMessage(paths?.length ? `Committed ${paths.length} staged file${paths.length === 1 ? '' : 's'}.` : 'Committed staged changes.');
    } catch (error) {
      setProjectPanelError(error instanceof Error ? error.message : String(error));
    } finally {
      setGitActionBusy(false);
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

  async function readProjectFileForContext(path: string): Promise<FileReadResult> {
    if (!selectedProject?.id) throw new Error('No project selected.');
    return await api.fileRead(selectedProject.id, path);
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
            approvals={state.approvals}
            selectedProjectId={selectedProject?.id}
            selectedThreadId={selectedThread?.id}
            onSelectProject={(projectId) => dispatch({ type: 'raw', method: 'selectProject', params: { projectId } })}
            onSelectThread={selectThread}
            onNewThread={createThread}
            onAddProject={(input) => addProject(input.cwd, input.name)}
            onRefreshThreads={refreshThreads}
            onOpenManagementTab={openManagementTab}
          />
        ) : null}
        <main className="thread-column">
          <ThreadHeader project={selectedProject} thread={selectedThread} cards={selectedCards} approvals={selectedApprovals} gitStatus={gitStatus} health={health} busy={busy} onInterrupt={interrupt} />
          {!inspectorVisible ? <ApprovalRail approvals={selectedApprovals} onDecision={approve} onFocusApproval={focusApproval} /> : null}
          <Timeline
            cards={selectedCards}
            focusedCardId={state.focusedCardId}
            project={selectedProject}
            gitStatus={gitStatus}
            approvals={selectedApprovals}
            agents={agents}
            agentsLoading={agentsLoading}
            health={health}
            connected={state.connected}
            onFocus={(cardId) => focusCard(cardId)}
          />
          <Composer
            disabled={!selectedProject || busy}
            onSubmit={startTurn}
            selectedThread={selectedThread}
            skills={skills}
            agents={agents}
            cards={selectedCards}
            fileTree={fileTree}
            fileContent={fileContent}
            gitStatus={gitStatus}
            gitDiff={gitDiff}
            githubActions={githubActions}
            health={health}
            browserFeedback={browserFeedback}
            artifactFeedback={artifactFeedback}
            skillsLoading={skillsLoading}
            agentsLoading={agentsLoading}
            skillsError={skillsError}
            agentsError={agentsError}
            capabilitySelection={composerCapabilitySelection}
            draftSelection={composerDraftSelection}
            codexWebConfig={codexWebConfig}
            onReloadSkills={() => reloadSkills(true)}
            onReadFileContext={readProjectFileForContext}
          />
        </main>
        {inspectorVisible ? (
          <Inspector
            card={focusedCard}
            cards={selectedCards}
            approvals={selectedApprovals}
            approvalHistory={selectedApprovalHistory}
            project={selectedProject}
            thread={selectedThread}
            errors={state.errors}
            account={account}
            fileTree={fileTree}
            fileContent={fileContent}
            gitStatus={gitStatus}
            gitDiff={gitDiff}
            gitOperations={selectedGitOperations}
            githubActions={githubActions}
            githubPullRequests={githubPullRequests}
            rawEvents={state.rawEvents}
            selectedGitPath={selectedGitPath}
            gitActionBusy={gitActionBusy}
            gitActionMessage={gitActionMessage}
            projectPanelLoading={projectPanelLoading}
            projectPanelError={projectPanelError}
            health={health}
            browserFeedback={browserFeedback}
            artifactFeedback={artifactFeedback}
            onBrowserFeedbackChange={setBrowserFeedback}
            onArtifactFeedbackChange={setArtifactFeedback}
            onSelectFile={(path) => void selectProjectFile(path)}
            onSelectGitFile={(path, cached) => void selectGitFile(path, cached)}
            onGitStage={(paths) => void runGitAction('stage', paths)}
            onGitUnstage={(paths) => void runGitAction('unstage', paths)}
            onGitCommit={(message, paths) => void commitGit(message, paths)}
            onRefreshProjectPanels={() => void reloadProjectPanels()}
            onStartReview={() => void startReview()}
            onFocusCard={(cardId) => focusCard(cardId, false)}
            onUsePrompt={useComposerDraft}
            tab={inspectorTab}
            onTabChange={setInspectorTab}
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
        onOpenManagementTab={openManagementTab}
        onToggleSidebar={() => setSidebarVisible((value) => !value)}
        onToggleInspector={() => setInspectorVisible((value) => !value)}
        onOpenActivity={() => setActivityOpen(true)}
        onLogout={codexWebConfig?.authRequired ? logout : undefined}
      />
      <ActivityCenter
        open={activityOpen}
        approvals={state.approvals}
        approvalHistory={state.approvalHistory}
        gitOperations={state.gitOperations}
        threads={state.threads}
        cards={state.cards}
        errors={state.errors}
        selectedThreadId={selectedThread?.id}
        onClose={() => setActivityOpen(false)}
        onSelectThread={selectThread}
        onDecision={approve}
        onFocusCard={(card) => {
          if (card.threadId !== selectedThread?.id) void selectThread(card.threadId);
          focusCard(card.id, true, card);
          setActivityOpen(false);
        }}
        onOpenInspectorTab={(tab) => { setInspectorVisible(true); setInspectorTab(tab); setActivityOpen(false); }}
      />
      <ManagementDrawer
        open={managementOpen}
        tab={managementTab}
        skills={skills}
        agents={agents}
        skillsLoading={skillsLoading}
        agentsLoading={agentsLoading}
        skillsError={skillsError}
        agentsError={agentsError}
        account={account}
        health={health}
        adminStatus={adminStatus}
        adminLoading={adminLoading}
        adminError={adminError}
        githubActions={githubActions}
        gitStatus={gitStatus}
        codexWebConfig={codexWebConfig}
        approvals={state.approvals}
        approvalHistory={state.approvalHistory}
        gitOperations={state.gitOperations}
        threads={state.threads}
        cards={state.cards}
        errors={state.errors}
        browserFeedback={browserFeedback}
        artifactFeedback={artifactFeedback}
        notificationsEnabled={notificationsEnabled}
        notificationsSupported={typeof Notification !== 'undefined'}
        onClose={() => setManagementOpen(false)}
        onTabChange={setManagementTab}
        onRefreshSkills={() => reloadSkills(true)}
        onRefreshAdmin={() => void reloadAdminStatus()}
        onUseSkill={(skill) => useComposerCapability('skill', skill.name)}
        onUseAgent={(agent) => useComposerCapability('agent', agent.name)}
        onUsePrompt={useComposerDraft}
        onToggleNotifications={(enabled) => void toggleNotifications(enabled)}
        onOpenInspectorTab={(tab) => { setInspectorVisible(true); setInspectorTab(tab); }}
        onSelectThread={selectThread}
      />
      <MobileDock
        approvalCount={state.approvals.length}
        active={activityOpen ? 'activity' : sidebarVisible ? 'threads' : inspectorVisible ? 'review' : 'chat'}
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function filterApprovalHistory(history: ApprovalRecord[], threadId?: string): ApprovalRecord[] {
  return history.filter((approval) => !approval.threadId || approval.threadId === threadId).slice(0, 12);
}

function filterGitOperations(history: GitOperationRecord[], projectId?: string): GitOperationRecord[] {
  return history.filter((operation) => !projectId || operation.projectId === projectId).slice(0, 12);
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
