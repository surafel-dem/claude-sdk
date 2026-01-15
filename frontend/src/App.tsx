import { useState, useRef, useEffect, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Loader2, FileText, X, Check, Edit3, Sparkles, Plus, MessageSquare, Trash2, LogOut, ArrowUp, ChevronDown, ChevronRight, Monitor, Cloud, Search, Globe, FileEdit } from 'lucide-react';
import { useSession, signIn, signUp, signOut } from './lib/auth-client';
import './App.css';

// Types
interface Activity {
  type: 'tool' | 'search' | 'status' | 'step' | 'result' | 'artifact';
  name: string;
  detail?: string;
  data?: Record<string, unknown>;
  timestamp?: number; // When this activity occurred
}

interface Artifact {
  id?: string;
  type: 'plan' | 'report';
  title?: string;
  content: string;
  editable?: boolean;
  preview?: string;
}

// Stream state for tracking timing
interface StreamState {
  startTime: number;
  endTime?: number;
  activities: Activity[];
  textContent: string;
  artifact: Artifact | null;
}

// Helper to parse server artifact data
function parseArtifact(data: { type: string; content: string; id?: string; title?: string }): Artifact {
  // Basic validation
  if (!data || typeof data.content !== 'string') {
    throw new Error('Invalid artifact data');
  }

  const content = data.content.trim();
  if (content.length < 5) {
    throw new Error('Content too short');
  }

  // Use server-provided ID if available, otherwise generate one (fallback)
  const id = data.id || crypto.randomUUID();

  // For plans, check for the expected format
  if (data.type === 'plan') {
    const titleMatch = content.match(/## Research:\s*([^\n]+)/);
    return {
      id,
      type: 'plan',
      title: data.title || (titleMatch ? titleMatch[1].trim() : 'Research Plan'),
      content,
      editable: true,
    };
  }

  return {
    id,
    type: data.type as 'plan' | 'report',
    title: data.title || (data.type === 'report' ? 'Research Report' : 'Document'),
    content,
    editable: false,
  };
}

interface MessagePart {
  type: 'text' | 'activity' | 'artifact';
  content: string;
  activities?: Activity[];
  artifact?: Artifact;
  // Timing info for ThinkingBlock
  startTime?: number;
  endTime?: number;
  duration?: number; // in seconds
}

interface Message {
  role: 'user' | 'assistant';
  parts: MessagePart[];
}

// === Auth Screen ===
function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Debug: Log the auth client config
  console.log('[Auth Debug] VITE_CONVEX_SITE_URL:', import.meta.env.VITE_CONVEX_SITE_URL);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    console.log('[Auth Debug] Attempting', isSignUp ? 'signUp' : 'signIn', 'with email:', email);

    try {
      if (isSignUp) {
        console.log('[Auth Debug] Calling signUp.email...');
        const result = await signUp.email({ email, password, name });
        console.log('[Auth Debug] signUp result:', result);
      } else {
        console.log('[Auth Debug] Calling signIn.email...');
        const result = await signIn.email({ email, password });
        console.log('[Auth Debug] signIn result:', result);
      }
    } catch (err) {
      console.error('[Auth Debug] Error:', err);
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    console.log('[Auth Debug] Attempting Google sign in...');
    signIn.social({ provider: "google" });
  };

  return (
    <div className="auth-screen">
      <div className="auth-container">
        <div className="auth-icon">
          <Sparkles size={32} />
        </div>
        <h1>Research Agent</h1>
        <p>{isSignUp ? 'Create an account' : 'Sign in to start researching'}</p>

        {/* Google Sign-In Button */}
        <button className="auth-btn google" onClick={handleGoogleSignIn}>
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Continue with Google
        </button>

        <div className="auth-divider">
          <span>or</span>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {isSignUp && (
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />

          {error && <p className="auth-error">{error}</p>}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? <Loader2 size={16} className="spin" /> : (isSignUp ? 'Sign Up' : 'Sign In')}
          </button>
        </form>

        <p className="auth-toggle">
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button type="button" onClick={() => setIsSignUp(!isSignUp)}>
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </button>
        </p>
      </div>
    </div>
  );
}

// === Sidebar ===
function Sidebar({
  activeThreadId,
  onSelectThread,
  onNewThread
}: {
  activeThreadId: Id<"threads"> | null;
  onSelectThread: (threadId: Id<"threads">) => void;
  onNewThread: () => void;
}) {
  const threads = useQuery(api.threads.list);
  const removeThread = useMutation(api.threads.remove);
  const { data: session } = useSession();
  const user = session?.user;

  const handleDelete = (e: React.MouseEvent, threadId: Id<"threads">) => {
    e.stopPropagation();
    if (confirm("Delete this research session?")) {
      removeThread({ threadId });
      if (activeThreadId === threadId) {
        onNewThread();
      }
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">Research Sessions</span>
        <button className="new-btn" onClick={onNewThread}>
          <Plus size={16} />
        </button>
      </div>

      <div className="thread-list">
        {threads === undefined ? (
          <div className="loading-threads"><Loader2 size={16} className="spin" /></div>
        ) : threads.length === 0 ? (
          <div className="empty-threads">
            <MessageSquare size={20} />
            <span>No sessions yet</span>
          </div>
        ) : (
          threads.map((thread) => (
            <div
              key={thread._id}
              className={`thread-item ${activeThreadId === thread._id ? "active" : ""}`}
              onClick={() => onSelectThread(thread._id)}
            >
              <div className="thread-info">
                <span className="thread-title">{thread.title}</span>
                <span className="thread-date">{formatDate(thread.updatedAt)}</span>
              </div>
              <button className="delete-btn" onClick={(e) => handleDelete(e, thread._id)}>
                <Trash2 size={12} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="sidebar-footer">
        {user && (
          <div className="user-info">
            <span className="user-email">{user.email || 'User'}</span>
            <button className="signout-btn" onClick={() => signOut()}>
              <LogOut size={14} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

// === Thinking Block (Collapsible like Cursor.ai) ===
// Shows real-time status during streaming, then collapses to "Completed in Xs" when done
function ThinkingBlock({
  activities,
  isStreaming,
  duration
}: {
  activities: Activity[];
  isStreaming?: boolean;
  duration?: number; // Duration in seconds when completed
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (activities.length === 0) return null;

  // Get icon for activity type
  const getActivityIcon = (activity: Activity) => {
    if (activity.type === 'search' || activity.name?.toLowerCase().includes('search')) {
      return <Search size={12} />;
    }
    if (activity.name?.toLowerCase().includes('read') || activity.name?.toLowerCase().includes('fetch')) {
      return <Globe size={12} />;
    }
    if (activity.name?.toLowerCase().includes('write')) {
      return <FileEdit size={12} />;
    }
    return <span className="activity-dot" />;
  };

  // Get human-readable label for tool
  const getActivityLabel = (activity: Activity): string => {
    const name = activity.name || '';
    // Map tool names to friendly labels
    if (name.includes('exa-search__search')) return 'Web Search';
    if (name.includes('exa-search__get_contents')) return 'Reading Sources';
    if (name === 'Write') return 'Writing';
    if (name === 'Read') return 'Reading';
    if (activity.type === 'step') return activity.name;
    if (activity.type === 'status') return activity.name;
    return name;
  };

  // Get detail text (search query, URL, etc.)
  const getActivityDetail = (activity: Activity): string | null => {
    if (activity.detail) return activity.detail;
    if (!activity.data) return null;

    const data = activity.data as Record<string, unknown>;
    const input = (data.input || data) as Record<string, unknown>;

    // Search query
    if (input.query) return `"${String(input.query).slice(0, 60)}${String(input.query).length > 60 ? '...' : ''}"`;
    // URLs
    if (input.urls && Array.isArray(input.urls)) {
      const urls = input.urls as string[];
      return urls.slice(0, 2).map(u => {
        try { return new URL(u).hostname; } catch { return u.slice(0, 30); }
      }).join(', ') + (urls.length > 2 ? ` +${urls.length - 2} more` : '');
    }
    // File path
    if (input.file_path) {
      const path = String(input.file_path);
      return path.split('/').pop() || path;
    }
    return null;
  };

  // Format duration nicely
  const formatDuration = (seconds: number): string => {
    if (seconds < 1) return '<1s';
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  // Get summary status - shows live status during streaming, completion info when done
  const getSummaryStatus = (): string => {
    // When completed, show duration
    if (!isStreaming && duration !== undefined) {
      return `Completed in ${formatDuration(duration)}`;
    }

    // During streaming: show current action
    const steps = activities.filter(a => a.type === 'step' || a.type === 'status');
    if (steps.length > 0) return steps[steps.length - 1].name;

    const tools = activities.filter(a => a.type === 'tool' || a.type === 'search');
    if (tools.length > 0) {
      const last = tools[tools.length - 1];
      return getActivityLabel(last);
    }

    return isStreaming ? 'Working...' : 'Completed';
  };

  // Filter to meaningful activities for the detail view
  const meaningfulActivities = activities.filter(a =>
    a.type === 'tool' || a.type === 'search' ||
    (a.type === 'step' && a.name && !a.name.includes('...'))
  );

  return (
    <div className={`thinking-block ${isStreaming ? 'streaming' : 'completed'}`}>
      <button
        className="thinking-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <ChevronRight
          size={14}
          className={`thinking-chevron ${isExpanded ? 'expanded' : ''}`}
        />
        <span className={isStreaming ? "thinking-status shimmer" : "thinking-status"}>
          {getSummaryStatus()}
        </span>
        {meaningfulActivities.length > 0 && (
          <span className="thinking-count">{meaningfulActivities.length} steps</span>
        )}
      </button>

      {isExpanded && meaningfulActivities.length > 0 && (
        <div className="thinking-details">
          {meaningfulActivities.map((activity, i) => {
            const detail = getActivityDetail(activity);
            return (
              <div key={i} className="thinking-step">
                <span className="thinking-step-icon">{getActivityIcon(activity)}</span>
                <span className="thinking-step-label">{getActivityLabel(activity)}</span>
                {detail && <span className="thinking-step-detail">{detail}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// === Artifact Card ===
function ArtifactCard({ artifact, onClick }: { artifact: Artifact; onClick: () => void }) {
  // Show helpful subtext based on artifact type
  const getSubtext = () => {
    if (artifact.type === 'plan') {
      return artifact.editable ? 'Waiting for approval' : '✓ Approved';
    }
    if (artifact.type === 'report') return 'Research Report';
    return artifact.type;
  };

  return (
    <button className="artifact-card" onClick={onClick}>
      <div className="artifact-card-icon"><FileText size={20} /></div>
      <div className="artifact-card-content">
        <span className="artifact-card-title">{artifact.title}</span>
        <span className="artifact-card-type">{getSubtext()}</span>
      </div>
    </button>
  );
}

// === Artifact Panel ===
function ArtifactPanel({ artifact, onClose, onSave, onApprove }: {
  artifact: Artifact;
  onClose: () => void;
  onSave?: (content: string) => void;
  onApprove?: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(artifact.content);

  useEffect(() => { setEditContent(artifact.content); }, [artifact.content]);

  const handleSave = () => { onSave?.(editContent); setIsEditing(false); };

  return (
    <div className="artifact-panel">
      <div className="panel-header">
        <div className="panel-title">
          <FileText size={14} />
          <span>{artifact.title}</span>
          {artifact.type === 'plan' && (
            <span className="panel-badge pending">Plan</span>
          )}
        </div>
        <div className="panel-actions">
          {artifact.editable && !isEditing && (
            <button className="panel-btn" onClick={() => setIsEditing(true)}>
              <Edit3 size={12} /> Edit
            </button>
          )}
          {isEditing && (
            <>
              <button className="panel-btn primary" onClick={handleSave}>
                <Check size={12} /> Save
              </button>
              <button className="panel-btn" onClick={() => { setEditContent(artifact.content); setIsEditing(false); }}>
                Cancel
              </button>
            </>
          )}
          <button className="panel-close" onClick={onClose}><X size={14} /></button>
        </div>
      </div>
      <div className="panel-content">
        {isEditing ? (
          <textarea className="panel-editor" value={editContent} onChange={(e) => setEditContent(e.target.value)} />
        ) : (
          <div className="panel-preview markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{artifact.content}</ReactMarkdown>
          </div>
        )}
      </div>
      {artifact.type === 'plan' && artifact.editable && onApprove && (
        <div className="panel-footer approval-actions">
          <button className="approve-btn" onClick={onApprove}>
            <Sparkles size={14} /> Approve & Start Research
          </button>
        </div>
      )}
    </div>
  );
}

// Clean text by removing internal markers and system messages
function cleanInternalMarkers(text: string): string {
  return text
    // Remove internal execution markers
    .replace(/\[EXECUTE_RESEARCH\]/g, '')
    .replace(/RESEARCH_TASK:[^\n]*/g, '')
    // Remove approval messages
    .replace(/✅ Approved. Starting research.../g, '')
    .replace(/^APPROVED:.*$/gm, '')
    // Remove stray markers
    .replace(/^\d+$/gm, '')
    .replace(/^complete$/gm, '')
    // Clean up empty containers
    .replace(/```\s*```/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// === Message Content ===
// Clean render with proper order: ThinkingBlock → Text → Artifacts
// Text is hidden during streaming to avoid visual clutter
function MessageContent({ parts, isStreaming, onArtifactClick }: {
  parts: MessagePart[];
  isStreaming?: boolean;
  onArtifactClick?: (artifact: Artifact) => void;
}) {
  // Collect all content from parts, preserving timing from activity part
  const allActivities: Activity[] = [];
  const textParts: string[] = [];
  const artifacts: Artifact[] = [];
  let duration: number | undefined;

  for (const part of parts) {
    if (part.type === 'activity' && part.activities) {
      allActivities.push(...part.activities);
      // Extract duration from activity part if completed
      if (part.duration !== undefined) {
        duration = part.duration;
      }
    } else if (part.type === 'artifact' && part.artifact) {
      artifacts.push(part.artifact);
    } else if (part.type === 'text') {
      const cleanedText = cleanInternalMarkers(part.content);
      if (cleanedText.trim()) {
        textParts.push(cleanedText);
      }
    }
  }

  // Combine all text into one block
  const combinedText = textParts.join('');

  // Don't render anything if there's no content
  if (!combinedText && artifacts.length === 0 && allActivities.length === 0) {
    return null;
  }

  // During streaming: hide text to keep UI clean (shows in ThinkingBlock instead)
  // After completion: show text summary below ThinkingBlock
  const shouldHideText = isStreaming && allActivities.length > 0;

  // Clean render order: ThinkingBlock → Text summary → Artifacts
  return (
    <div className="message-content">
      {/* 1. ThinkingBlock: Shows live status during streaming, "Completed in Xs" when done */}
      {allActivities.length > 0 && (
        <ThinkingBlock
          activities={allActivities}
          isStreaming={isStreaming}
          duration={duration}
        />
      )}

      {/* 2. Text summary: Only shown after streaming completes */}
      {combinedText && !shouldHideText && (
        <div className="markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{combinedText}</ReactMarkdown>
        </div>
      )}

      {/* 3. Artifact cards: Clickable cards for plans/reports */}
      {artifacts.map((artifact, i) => (
        <ArtifactCard key={i} artifact={artifact} onClick={() => onArtifactClick?.(artifact)} />
      ))}
    </div>
  );
}

// === Main App ===
function MainApp() {
  const { threadId: urlThreadId } = useParams<{ threadId?: string }>();
  const navigate = useNavigate();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentParts, setCurrentParts] = useState<MessagePart[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<Id<"threads"> | null>(null);
  const [activeArtifact, setActiveArtifact] = useState<Artifact | null>(null);
  const [executionMode, setExecutionMode] = useState<'local' | 'sandbox'>('local');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const currentRunIdRef = useRef<string | null>(null);  // Track current run for continuation

  // Convex mutations for persistence (fire-and-forget, don't affect UI)
  const createThread = useMutation(api.threads.create);
  const sendMessage = useMutation(api.messages.send);
  const updateArtifact = useMutation(api.artifacts.update);

  // Load thread history from Convex - only used for initial load, not real-time sync
  const loadThreadHistory = async (threadId: Id<"threads">) => {
    try {
      // Fetch messages and artifacts via Convex HTTP endpoint
      const [messagesRes, artifactsRes] = await Promise.all([
        fetch(`${import.meta.env.VITE_CONVEX_URL?.replace('.cloud', '.site') || 'https://animated-wallaby-539.convex.site'}/api/query?path=messages:list&args=${encodeURIComponent(JSON.stringify({ threadId }))}`),
        fetch(`${import.meta.env.VITE_CONVEX_URL?.replace('.cloud', '.site') || 'https://animated-wallaby-539.convex.site'}/api/query?path=artifacts:listByThread&args=${encodeURIComponent(JSON.stringify({ threadId }))}`)
      ]);

      const messagesData = await messagesRes.json();
      const artifactsData = await artifactsRes.json();

      const threadMessages = messagesData.value || [];
      const threadArtifacts = artifactsData.value || [];

      console.log('[Load] Thread history:', { messages: threadMessages.length, artifacts: threadArtifacts.length });

      if (threadMessages.length === 0) {
        setMessages([]);
        return;
      }

      // Track which artifacts have been assigned
      const usedArtifactIds = new Set<string>();

      const loadedMessages: Message[] = threadMessages.map((msg: { role: string; content: string; createdAt: number }, index: number) => {
        let content = msg.content;
        if (content.startsWith('APPROVED:')) {
          content = '';
        }

        const parts: MessagePart[] = [];

        if (content) {
          parts.push({ type: 'text', content });
        }

        // Attach artifacts to assistant messages
        if (msg.role === 'assistant' && threadArtifacts.length > 0) {
          const persistedArtifact = threadArtifacts.find((a: any) => {
            if (usedArtifactIds.has(a._id)) return false;
            return a.createdAt >= msg.createdAt - 5000 && a.createdAt <= msg.createdAt + 120000;
          });

          if (persistedArtifact) {
            usedArtifactIds.add(persistedArtifact._id);
            const isEditable = persistedArtifact.type === 'plan' && persistedArtifact.status === 'draft';
            parts.push({
              type: 'artifact',
              content: '',
              artifact: {
                id: persistedArtifact._id,
                type: persistedArtifact.type as 'plan' | 'report',
                title: persistedArtifact.title,
                content: persistedArtifact.content,
                editable: isEditable
              }
            });
          }
        }

        return { role: msg.role as 'user' | 'assistant', parts };
      });

      setMessages(loadedMessages);
    } catch (error) {
      console.error('[Load] Failed to load thread history:', error);
      setMessages([]);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentParts]);

  // Load thread history when URL changes (switching threads)
  useEffect(() => {
    if (urlThreadId && urlThreadId !== activeThreadId) {
      const threadId = urlThreadId as Id<"threads">;
      setActiveThreadId(threadId);
      setCurrentParts([]);
      setActiveArtifact(null);
      // Load history from Convex (one-time fetch, not real-time)
      loadThreadHistory(threadId);
    }
  }, [urlThreadId]);

  const handleNewThread = async () => {
    setActiveThreadId(null);
    setMessages([]);
    setCurrentParts([]);
    navigate('/');
  };

  const handleSelectThread = (threadId: Id<"threads">) => {
    setActiveThreadId(threadId);
    setCurrentParts([]);
    setActiveArtifact(null);
    navigate(`/chat/${threadId}`);
    // Load history from Convex (one-time fetch)
    loadThreadHistory(threadId);
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    // Create thread if needed
    let threadId = activeThreadId;
    if (!threadId) {
      const title = userMessage.slice(0, 50) + (userMessage.length > 50 ? '...' : '');
      threadId = await createThread({ title });
      setActiveThreadId(threadId);
      navigate(`/chat/${threadId}`);
    }

    // Show user message IMMEDIATELY
    setMessages(prev => [...prev, { role: 'user', parts: [{ type: 'text', content: userMessage }] }]);
    setIsLoading(true);
    setCurrentParts([]);

    // Save user message to Convex in background (fire-and-forget)
    sendMessage({ threadId, role: 'user', content: userMessage });

    try {
      const chatResponse = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, threadId, mode: executionMode }),
        credentials: 'include',
      });

      const data = await chatResponse.json();
      currentRunIdRef.current = data.runId;
      const eventSource = new EventSource(`http://localhost:3001/api/stream/${data.runId}`);

      // ========== CLEAN STREAM STATE ==========
      // Single source of truth for all streaming data
      const streamState: StreamState = {
        startTime: Date.now(),
        activities: [],
        textContent: '',
        artifact: null,
      };

      // Helper to build and update currentParts from streamState
      const updateUI = () => {
        const parts: MessagePart[] = [];

        // 1. Activity part (ThinkingBlock) - always first
        if (streamState.activities.length > 0) {
          parts.push({
            type: 'activity',
            content: '',
            activities: [...streamState.activities],
            startTime: streamState.startTime,
          });
        }

        // 2. Text part (hidden during streaming by MessageContent)
        if (streamState.textContent) {
          parts.push({ type: 'text', content: streamState.textContent });
        }

        // 3. Artifact part - always last
        if (streamState.artifact) {
          parts.push({ type: 'artifact', content: '', artifact: streamState.artifact });
        }

        setCurrentParts(parts);
      };

      // ========== EVENT HANDLERS ==========

      eventSource.addEventListener('text', (event) => {
        streamState.textContent += event.data;
        updateUI();
      });

      eventSource.addEventListener('tool', (event) => {
        try {
          // Backend may send JSON object or plain string
          let toolName: string;
          let toolData: Record<string, unknown> = {};

          try {
            const parsed = JSON.parse(event.data);
            toolName = parsed.name || event.data;
            toolData = parsed;
          } catch {
            // Plain string tool name
            toolName = event.data;
          }

          const isSearch = toolName?.includes('search') || toolName === 'WebSearch' || toolName === 'WebFetch';
          streamState.activities.push({
            type: isSearch ? 'search' : 'tool',
            name: toolName,
            detail: getToolDetail({ name: toolName, ...toolData }),
            data: toolData,
            timestamp: Date.now(),
          });
          updateUI();
        } catch (e) {
          console.error('[tool event error]', e, event.data);
        }
      });

      eventSource.addEventListener('phase', (event) => {
        streamState.activities.push({
          type: 'status',
          name: event.data,
          timestamp: Date.now(),
        });
        updateUI();
      });

      eventSource.addEventListener('status', (event) => {
        // Replace existing step status or add new one
        const stepIdx = streamState.activities.findIndex(a => a.type === 'step');
        if (stepIdx >= 0) {
          streamState.activities[stepIdx] = { type: 'step', name: event.data, timestamp: Date.now() };
        } else {
          streamState.activities.push({ type: 'step', name: event.data, timestamp: Date.now() });
        }
        updateUI();
      });

      eventSource.addEventListener('artifact', (event) => {
        console.log('[artifact event]', event.data);
        try {
          const artifactData = parseArtifact(JSON.parse(event.data));
          console.log('[artifact parsed]', artifactData);
          streamState.artifact = artifactData;
          updateUI();

          // Auto-open artifact panel
          setActiveArtifact(artifactData);
        } catch (e) {
          console.error('[artifact parse error]', e, event.data);
        }
      });

      eventSource.addEventListener('done', async () => {
        eventSource.close();

        // Calculate duration
        streamState.endTime = Date.now();
        const duration = (streamState.endTime - streamState.startTime) / 1000;

        // Build final parts with duration
        const finalParts: MessagePart[] = [];

        if (streamState.activities.length > 0) {
          finalParts.push({
            type: 'activity',
            content: '',
            activities: streamState.activities,
            startTime: streamState.startTime,
            endTime: streamState.endTime,
            duration,
          });
        }

        if (streamState.textContent) {
          finalParts.push({ type: 'text', content: streamState.textContent });
        }

        if (streamState.artifact) {
          finalParts.push({ type: 'artifact', content: '', artifact: streamState.artifact });
        }

        // Save to Convex in background (fire-and-forget)
        if (streamState.textContent && threadId) {
          sendMessage({ threadId, role: 'assistant', content: streamState.textContent });
        }

        setMessages(prev => [...prev, { role: 'assistant', parts: finalParts }]);
        setCurrentParts([]);
        setIsLoading(false);
      });

      eventSource.addEventListener('error', () => {
        eventSource.close();
        setCurrentParts([]);
        setIsLoading(false);
      });

    } catch (error) {
      console.error('Error:', error);
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  };

  const handleArtifactSave = async (content: string) => {
    if (!activeArtifact?.id) return;
    try {
      // Use Convex mutation directly - real-time sync handles the rest
      await updateArtifact({ id: activeArtifact.id, content });
      setActiveArtifact(prev => prev ? { ...prev, content } : null);
    } catch (e) {
      console.error('[Artifact] Failed to save:', e);
    }
  };

  const handleApprove = async () => {
    if (!activeArtifact || !currentRunIdRef.current) return;

    const planContent = activeArtifact.content;
    setActiveArtifact(null);
    setIsLoading(true);

    // Update the artifact in messages to show as approved
    setMessages(prev => prev.map(msg => ({
      ...msg,
      parts: msg.parts.map(part =>
        part.type === 'artifact' && part.artifact?.type === 'plan'
          ? { ...part, artifact: { ...part.artifact!, editable: false } }
          : part
      )
    })));

    // Add user approval message to UI
    setMessages(prev => [...prev, {
      role: 'user',
      parts: [{ type: 'text', content: '✅ Approved. Starting research...' }]
    }]);

    try {
      const res = await fetch(`http://localhost:3001/api/continue/${currentRunIdRef.current}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', plan: planContent })
      });

      if (!res.ok || !res.body) {
        throw new Error('Failed to start research');
      }

      // ========== CLEAN STREAM STATE ==========
      const streamState: StreamState = {
        startTime: Date.now(),
        activities: [],
        textContent: '',
        artifact: null,
      };

      // Helper to build and update currentParts from streamState
      const updateUI = () => {
        const parts: MessagePart[] = [];

        // 1. Activity part (ThinkingBlock) - always first
        if (streamState.activities.length > 0) {
          parts.push({
            type: 'activity',
            content: '',
            activities: [...streamState.activities],
            startTime: streamState.startTime,
          });
        }

        // 2. Text part (hidden during streaming)
        if (streamState.textContent) {
          parts.push({ type: 'text', content: streamState.textContent });
        }

        // 3. Artifact part - always last
        if (streamState.artifact) {
          parts.push({ type: 'artifact', content: '', artifact: streamState.artifact });
        }

        setCurrentParts(parts);
      };

      // ========== SSE PARSING ==========
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.startsWith('event:')) {
            const eventType = line.slice(6).trim();
            const dataLine = lines[i + 1];
            const data = dataLine?.startsWith('data:') ? dataLine.slice(5).trim() : '';

            switch (eventType) {
              case 'text':
                streamState.textContent += data;
                updateUI();
                break;

              case 'status':
              case 'phase':
                // Replace existing step or add new one
                const stepIdx = streamState.activities.findIndex(a => a.type === 'step');
                if (stepIdx >= 0) {
                  streamState.activities[stepIdx] = { type: 'step', name: data, timestamp: Date.now() };
                } else {
                  streamState.activities.push({ type: 'step', name: data, timestamp: Date.now() });
                }
                updateUI();
                break;

              case 'tool':
                try {
                  const toolData = JSON.parse(data);
                  const isSearch = toolData.name?.includes('search') || toolData.name === 'WebSearch' || toolData.name === 'WebFetch';
                  streamState.activities.push({
                    type: isSearch ? 'search' : 'tool',
                    name: toolData.name,
                    detail: getToolDetail(toolData),
                    data: toolData,
                    timestamp: Date.now(),
                  });
                  updateUI();
                } catch { /* ignore */ }
                break;

              case 'artifact':
                try {
                  const artifactData = parseArtifact(JSON.parse(data));
                  streamState.artifact = artifactData;
                  updateUI();
                  setActiveArtifact(artifactData);
                } catch { /* ignore */ }
                break;

              case 'error':
                console.error('Research error:', data);
                break;
            }
          }
        }
      }

      // ========== FINALIZE ==========
      streamState.endTime = Date.now();
      const duration = (streamState.endTime - streamState.startTime) / 1000;

      const finalParts: MessagePart[] = [];

      if (streamState.activities.length > 0) {
        finalParts.push({
          type: 'activity',
          content: '',
          activities: streamState.activities,
          startTime: streamState.startTime,
          endTime: streamState.endTime,
          duration,
        });
      }

      if (streamState.textContent) {
        finalParts.push({ type: 'text', content: streamState.textContent });
      }

      if (streamState.artifact) {
        finalParts.push({ type: 'artifact', content: '', artifact: streamState.artifact });
      }

      // Save to Convex in background (fire-and-forget)
      if (streamState.textContent && activeThreadId) {
        sendMessage({ threadId: activeThreadId, role: 'assistant', content: streamState.textContent });
      }

      setMessages(prev => [...prev, { role: 'assistant', parts: finalParts }]);
      setCurrentParts([]);
      setIsLoading(false);

    } catch (error) {
      console.error('Approval error:', error);
      setIsLoading(false);
    }
  };

  return (
    <div className={`app ${activeArtifact ? 'panel-open' : ''}`}>
      <Sidebar
        activeThreadId={activeThreadId}
        onSelectThread={handleSelectThread}
        onNewThread={handleNewThread}
      />

      <div className="main-content">
        {/* Landing state: centered greeting + input */}
        {messages.length === 0 && !isLoading ? (
          <div className="landing">
            <div className="landing-content">
              <h1 className="landing-title">What would you like to research?</h1>
              <p className="landing-subtitle">I'll create a plan, gather information, and write a comprehensive report.</p>

              <form onSubmit={handleSubmit} className="claude-input">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleTextareaChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything..."
                  disabled={isLoading}
                  rows={1}
                />
                <div className="claude-input-toolbar">
                  <div className="toolbar-left">
                    <button type="button" className="icon-btn" title="Attach files">
                      <Plus size={18} />
                    </button>
                    <div className="mode-dropdown">
                      <button
                        type="button"
                        className="mode-dropdown-trigger"
                        onClick={() => setExecutionMode(executionMode === 'local' ? 'sandbox' : 'local')}
                      >
                        {executionMode === 'local' ? <Monitor size={14} /> : <Cloud size={14} />}
                        <span>{executionMode === 'local' ? 'Local' : 'Sandbox'}</span>
                        <ChevronDown size={14} />
                      </button>
                    </div>
                  </div>
                  <button type="submit" disabled={isLoading || !input.trim()} className="send-btn-arrow">
                    <ArrowUp size={18} strokeWidth={2.5} />
                  </button>
                </div>
              </form>

              <div className="suggestion-chips">
                <button onClick={() => setInput("Research the latest trends in AI agents")} className="chip">
                  AI agent trends
                </button>
                <button onClick={() => setInput("Compare React vs Vue for building apps")} className="chip">
                  React vs Vue
                </button>
                <button onClick={() => setInput("Explain how transformers work in LLMs")} className="chip">
                  Transformers in LLMs
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Chat state: messages + bottom input */
          <>
            <div className="main-container">
              <main className="chat-area">
                <div className="messages">
                  {messages.map((msg, i) => {
                    // Skip rendering if message has no meaningful content
                    const hasContent = msg.parts.some(p =>
                      (p.type === 'text' && p.content.trim()) ||
                      p.type === 'artifact' ||
                      (p.type === 'activity' && p.activities?.length)
                    );
                    if (!hasContent) return null;

                    return (
                      <div key={i} className={`message ${msg.role}`}>
                        <MessageContent parts={msg.parts} onArtifactClick={setActiveArtifact} />
                      </div>
                    );
                  })}

                  {(currentParts.length > 0 || isLoading) && (
                    <div className="message assistant">
                      {currentParts.length > 0 ? (
                        <MessageContent parts={currentParts} isStreaming onArtifactClick={setActiveArtifact} />
                      ) : (
                        <div className="status-indicator">
                          <span className="status-shimmer">Thinking...</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              </main>

              {activeArtifact && (
                <ArtifactPanel
                  artifact={activeArtifact}
                  onClose={() => setActiveArtifact(null)}
                  onSave={handleArtifactSave}
                  onApprove={activeArtifact.type === 'plan' && activeArtifact.editable ? handleApprove : undefined}
                />
              )}
            </div>

            <footer className="input-area">
              <form onSubmit={handleSubmit} className="claude-input">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleTextareaChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Continue the conversation..."
                  disabled={isLoading}
                  rows={1}
                />
                <div className="claude-input-toolbar">
                  <div className="toolbar-left">
                    <button type="button" className="icon-btn" title="Attach files">
                      <Plus size={18} />
                    </button>
                    <div className="mode-dropdown">
                      <button
                        type="button"
                        className="mode-dropdown-trigger"
                        onClick={() => setExecutionMode(executionMode === 'local' ? 'sandbox' : 'local')}
                      >
                        {executionMode === 'local' ? <Monitor size={14} /> : <Cloud size={14} />}
                        <span>{executionMode === 'local' ? 'Local' : 'Sandbox'}</span>
                        <ChevronDown size={14} />
                      </button>
                    </div>
                  </div>
                  <button type="submit" disabled={isLoading || !input.trim()} className="send-btn-arrow">
                    {isLoading ? <Loader2 size={18} className="spin" /> : <ArrowUp size={18} strokeWidth={2.5} />}
                  </button>
                </div>
              </form>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

// === Root App ===
export default function App() {
  const { data: session, isPending, error } = useSession();

  // Debug
  console.log('Auth state:', { session, isPending, error });

  if (isPending) {
    return (
      <div className="loading-screen">
        <Loader2 size={32} className="spin" />
      </div>
    );
  }

  // Check if user is authenticated
  if (!session?.user) {
    return <AuthScreen />;
  }

  return <MainApp />;
}

// === Helpers ===
function getToolDetail(toolData: { name: string; input?: Record<string, unknown> }): string {
  const input = toolData.input || {};
  const name = toolData.name || '';

  // Handle Exa search tools
  if (name.includes('exa-search__search')) {
    return String(input.query || '').slice(0, 50);
  }
  if (name.includes('exa-search__get_contents')) {
    const urls = input.urls as string[] || [];
    return urls.slice(0, 2).map(u => {
      try { return new URL(u).hostname; } catch { return u.slice(0, 20); }
    }).join(', ');
  }

  switch (name) {
    case 'Read':
    case 'Write':
      return String(input.file_path || '').split('/').pop() || '';
    case 'WebSearch':
      return String(input.query || '').slice(0, 40);
    case 'WebFetch':
      return String(input.url || '').replace(/^https?:\/\//, '').slice(0, 40);
    default:
      // Try to extract query from input if available
      if (input.query) return String(input.query).slice(0, 40);
      return '';
  }
}
