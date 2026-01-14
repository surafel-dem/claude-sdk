import { useState, useRef, useEffect, type FormEvent } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, Loader2, FileText, X, Check, Edit3, Sparkles, Plus, MessageSquare, Trash2, LogOut, ChevronRight, AlertCircle } from 'lucide-react';
import { useSession, signIn, signUp, signOut } from './lib/auth-client';
import './App.css';

// Types
interface Activity {
  type: 'tool' | 'search' | 'status' | 'step' | 'result' | 'artifact';
  name: string;
  detail?: string;
  data?: Record<string, unknown>;
}

interface Artifact {
  id?: string;
  type: 'plan' | 'report';
  title?: string;
  content: string;
  editable?: boolean;
  preview?: string;
}

// Helper to parse server artifact data
function parseArtifact(data: { type: string; content: string }): Artifact {
  // Basic validation
  if (!data || typeof data.content !== 'string') {
    throw new Error('Invalid artifact data');
  }

  const content = data.content.trim();
  if (content.length < 5) {
    throw new Error('Content too short');
  }

  // For plans, check for the expected format
  if (data.type === 'plan') {
    const titleMatch = content.match(/## Research:\s*([^\n]+)/);
    return {
      id: crypto.randomUUID(),
      type: 'plan',
      title: titleMatch ? titleMatch[1].trim() : 'Research Plan',
      content,
      editable: true,
    };
  }

  return {
    id: crypto.randomUUID(),
    type: data.type as 'plan' | 'report',
    title: data.type === 'report' ? 'Research Report' : 'Document',
    content,
    editable: false,
  };
}

interface MessagePart {
  type: 'text' | 'activity' | 'artifact';
  content: string;
  activities?: Activity[];
  artifact?: Artifact;
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

// === Status Indicator (Cursor & Motion Primitives Style) ===
function StatusIndicator({ activities, isStreaming }: { activities: Activity[]; isStreaming?: boolean }) {
  const [isOpen, setIsOpen] = useState(isStreaming ?? false);

  if (activities.length === 0) return null;

  useEffect(() => {
    if (isStreaming === false) {
      const timer = setTimeout(() => setIsOpen(false), 1500);
      return () => clearTimeout(timer);
    } else if (isStreaming === true) {
      setIsOpen(true);
    }
  }, [isStreaming]);

  const getLatestStatus = (): string => {
    const latest = activities[activities.length - 1];
    if (isStreaming) {
      if (latest.name === 'WebSearch') return 'Searching the web...';
      if (latest.name === 'Write') return 'Writing report...';
      if (latest.name === 'WebFetch' || latest.name === 'Read') return 'Reading content...';
      return latest.name || 'Thinking...';
    }
    return 'Research complete';
  };

  return (
    <div className={`status-indicator ${isOpen ? 'open' : ''}`}>
      <div className="status-header" onClick={() => setIsOpen(!isOpen)}>
        <ChevronRight size={14} className={`status-chevron ${isOpen ? 'open' : ''}`} />
        <span className={isStreaming ? "status-shimmer" : "status-text-finished"}>
          {getLatestStatus()}
        </span>
      </div>

      {isOpen && (
        <div className="tool-logs">
          {activities.map((activity, i) => (
            <div key={i} className="tool-log-item">
              <div className="tool-log-content">
                <span className="tool-log-name">{activity.name}</span>
                {activity.detail && <span className="tool-log-detail">{activity.detail}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// === Artifact Card ===
function ArtifactCard({ artifact, onClick }: { artifact: Artifact; onClick: () => void }) {
  // Show helpful subtext based on artifact type
  const getSubtext = () => {
    if (artifact.type === 'plan') return artifact.editable ? 'Waiting for approval' : 'Plan';
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
function MessageContent({ parts, isStreaming, onArtifactClick }: {
  parts: MessagePart[];
  isStreaming?: boolean;
  onArtifactClick?: (artifact: Artifact) => void;
}) {
  // Collect all activities for a single status indicator
  const allActivities: Activity[] = [];
  const contentGroups: { type: 'text' | 'artifact'; content: string; artifact?: Artifact }[] = [];

  for (const part of parts) {
    if (part.type === 'activity' && part.activities) {
      allActivities.push(...part.activities);
    } else if (part.type === 'artifact' && part.artifact) {
      contentGroups.push({ type: 'artifact', content: '', artifact: part.artifact });
    } else if (part.type === 'text') {
      const cleanedText = cleanInternalMarkers(part.content);
      if (cleanedText.trim()) {
        // Merge consecutive text parts
        const lastGroup = contentGroups[contentGroups.length - 1];
        if (lastGroup && lastGroup.type === 'text') {
          lastGroup.content += cleanedText;
        } else {
          contentGroups.push({ type: 'text', content: cleanedText });
        }
      }
    }
  }

  return (
    <div className="message-content">
      {contentGroups.map((group, i) => {
        if (group.type === 'text') {
          return <div key={i} className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{group.content}</ReactMarkdown></div>;
        }
        if (group.type === 'artifact' && group.artifact) {
          return <ArtifactCard key={i} artifact={group.artifact} onClick={() => onArtifactClick?.(group.artifact!)} />;
        }
        return null;
      })}

      {/* Status indicator for research steps */}
      {allActivities.length > 0 && (
        <StatusIndicator activities={allActivities} isStreaming={isStreaming} />
      )}
    </div>
  );
}

// === Main App ===
function MainApp() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentParts, setCurrentParts] = useState<MessagePart[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<Id<"threads"> | null>(null);
  const [activeArtifact, setActiveArtifact] = useState<Artifact | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isStreamingRef = useRef(false);  // Track if we're streaming
  const currentRunIdRef = useRef<string | null>(null);  // Track current run for continuation

  // Store artifacts separately so Convex sync doesn't kill them
  const artifactsRef = useRef<Map<number, Artifact>>(new Map());

  const createThread = useMutation(api.threads.create);
  const sendMessage = useMutation(api.messages.send);
  const threadMessages = useQuery(
    api.messages.list,
    activeThreadId ? { threadId: activeThreadId } : "skip"
  );

  // Load messages when thread changes - BUT preserve artifacts!
  // This prevents Convex real-time updates from overwriting streaming artifacts
  useEffect(() => {
    // Don't sync while streaming - streaming has the authoritative data
    if (isStreamingRef.current) {
      return;
    }

    if (threadMessages) {
      // When syncing from Convex, preserve any artifacts we captured during streaming
      const loadedMessages: Message[] = threadMessages.map((msg: { role: string; content: string }, index: number) => {
        // Hide approval messages completely from display
        let content = msg.content;
        if (content.startsWith('APPROVED:')) {
          content = ''; // Hide the internal approval message
        }

        const parts: MessagePart[] = [{ type: 'text', content }];

        // Restore artifact if we have one for this message index
        const artifact = artifactsRef.current.get(index);
        if (artifact) {
          parts.push({ type: 'artifact', content: '', artifact });
        }

        return {
          role: msg.role as 'user' | 'assistant',
          parts
        };
      });
      setMessages(loadedMessages);
    } else {
      setMessages([]);
      artifactsRef.current.clear();  // Clear artifacts when thread is cleared
    }
  }, [threadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentParts]);

  const handleNewThread = async () => {
    setActiveThreadId(null);
    setMessages([]);
    setCurrentParts([]);
  };

  const handleSelectThread = (threadId: Id<"threads">) => {
    setActiveThreadId(threadId);
    setCurrentParts([]);
    setActiveArtifact(null);
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
    }

    // Save user message to Convex
    await sendMessage({ threadId, role: 'user', content: userMessage });

    setMessages(prev => [...prev, { role: 'user', parts: [{ type: 'text', content: userMessage }] }]);
    setIsLoading(true);
    setCurrentParts([]);

    try {
      // Include credentials for auth cookie
      const chatResponse = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, threadId }),
        credentials: 'include', // Send auth cookies
      });

      const data = await chatResponse.json();
      isStreamingRef.current = true;  // Mark streaming started
      currentRunIdRef.current = data.runId;  // Store runId for continuation
      const eventSource = new EventSource(`http://localhost:3001/api/stream/${data.runId}`);
      let parts: MessagePart[] = [];
      let currentActivities: Activity[] = [];
      let fullResponse = '';

      eventSource.addEventListener('text', (event) => {
        if (currentActivities.length > 0) {
          parts = [...parts, { type: 'activity', content: '', activities: [...currentActivities] }];
          currentActivities = [];
        }
        fullResponse += event.data;
        const lastPart = parts[parts.length - 1];
        if (lastPart && lastPart.type === 'text') {
          lastPart.content += event.data;
        } else {
          parts = [...parts, { type: 'text', content: event.data }];
        }
        setCurrentParts([...parts]);
      });

      eventSource.addEventListener('tool', (event) => {
        try {
          const toolData = JSON.parse(event.data);
          const isSearch = toolData.name === 'WebSearch' || toolData.name === 'WebFetch';
          currentActivities.push({
            type: isSearch ? 'search' : 'tool',
            name: toolData.name,
            detail: getToolDetail(toolData),
          });
          updateActivityParts(parts, currentActivities, setCurrentParts);
        } catch { /* ignore */ }
      });

      eventSource.addEventListener('phase', (event) => {
        currentActivities.push({ type: 'status', name: event.data });
        updateActivityParts(parts, currentActivities, setCurrentParts);
      });

      eventSource.addEventListener('status', (event) => {
        currentActivities.push({ type: 'step', name: event.data });
        updateActivityParts(parts, currentActivities, setCurrentParts);
      });

      eventSource.addEventListener('artifact', (event) => {
        try {
          const artifactData = parseArtifact(JSON.parse(event.data));
          if (currentActivities.length > 0) {
            parts = [...parts, { type: 'activity', content: '', activities: [...currentActivities] }];
            currentActivities = [];
          }
          parts = [...parts, { type: 'artifact', content: '', artifact: artifactData }];
          setCurrentParts([...parts]);

          // Auto-open artifact panel for plans and reports
          setActiveArtifact(artifactData);

          // Save artifact to ref so Convex sync doesn't lose it
          // Use the current message count as the index
          artifactsRef.current.set(messages.length, artifactData);
        } catch { /* ignore */ }
      });

      eventSource.addEventListener('done', async () => {
        eventSource.close();
        if (currentActivities.length > 0) {
          parts = [...parts, { type: 'activity', content: '', activities: currentActivities }];
        }

        // Save assistant message to Convex
        if (fullResponse && threadId) {
          await sendMessage({ threadId, role: 'assistant', content: fullResponse });
        }

        setMessages(prev => [...prev, { role: 'assistant', parts: [...parts] }]);
        setCurrentParts([]);
        setIsLoading(false);
        isStreamingRef.current = false;  // Mark streaming ended
      });

      eventSource.addEventListener('error', () => {
        eventSource.close();
        setCurrentParts([]);
        setIsLoading(false);
        isStreamingRef.current = false;  // Mark streaming ended
      });
    } catch (error) {
      console.error('Error:', error);
      setIsLoading(false);
      isStreamingRef.current = false;  // Mark streaming ended
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  };

  const handleArtifactSave = async (content: string) => {
    if (!activeArtifact) return;
    try {
      await fetch(`http://localhost:3001/api/artifacts/${activeArtifact.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      setActiveArtifact(prev => prev ? { ...prev, content } : null);
    } catch { /* ignore */ }
  };

  const handleApprove = async () => {
    if (!activeArtifact || !currentRunIdRef.current) return;

    const planContent = activeArtifact.content;
    setActiveArtifact(null);
    setIsLoading(true);
    isStreamingRef.current = true;

    // Add user approval message to UI
    setMessages(prev => [...prev, {
      role: 'user',
      parts: [{ type: 'text', content: '✅ Approved. Starting research...' }]
    }]);

    try {
      // POST to /api/continue - response IS the SSE stream
      const res = await fetch(`http://localhost:3001/api/continue/${currentRunIdRef.current}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', plan: planContent })
      });

      if (!res.ok || !res.body) {
        throw new Error('Failed to start research');
      }

      // Read SSE from POST response body
      let parts: MessagePart[] = [];
      let currentActivities: Activity[] = [];
      let fullResponse = '';

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            const eventType = line.slice(6).trim();
            const dataLine = lines[lines.indexOf(line) + 1];
            const data = dataLine?.startsWith('data:') ? dataLine.slice(5).trim() : '';

            switch (eventType) {
              case 'text':
                fullResponse += data;
                parts = [...parts, { type: 'text', content: data }];
                setCurrentParts([...parts]);
                break;

              case 'status':
              case 'phase':
                currentActivities.push({ type: 'step', name: data });
                parts = [...parts, { type: 'activity', content: '', activities: [...currentActivities] }];
                currentActivities = [];
                setCurrentParts([...parts]);
                break;

              case 'tool':
                try {
                  const toolData = JSON.parse(data);
                  currentActivities.push({ type: 'tool', name: toolData.name, detail: toolData.input?.query });
                  parts = [...parts, { type: 'activity', content: '', activities: [...currentActivities] }];
                  currentActivities = [];
                  setCurrentParts([...parts]);
                } catch { /* ignore */ }
                break;

              case 'artifact':
                try {
                  const artifactData = parseArtifact(JSON.parse(data));
                  parts = [...parts, { type: 'artifact', content: '', artifact: artifactData }];
                  setCurrentParts([...parts]);
                  setActiveArtifact(artifactData);
                  artifactsRef.current.set(messages.length + 1, artifactData);
                } catch { /* ignore */ }
                break;

              case 'done':
                // Complete
                break;

              case 'error':
                console.error('Research error:', data);
                break;
            }
          }
        }
      }

      // Finalize
      if (fullResponse && activeThreadId) {
        await sendMessage({ threadId: activeThreadId, role: 'assistant', content: fullResponse });
      }

      setMessages(prev => [...prev, { role: 'assistant', parts: [...parts] }]);
      setCurrentParts([]);
      setIsLoading(false);
      isStreamingRef.current = false;

    } catch (error) {
      console.error('Approval error:', error);
      setIsLoading(false);
      isStreamingRef.current = false;
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
        <header className="header">
          <span className="logo">Research Agent</span>
        </header>

        <div className="main-container">
          <main className="chat-area">
            <div className="messages">
              {messages.length === 0 && !isLoading && (
                <div className="welcome">
                  <div className="welcome-icon"><Sparkles size={32} /></div>
                  <h1>Research Agent</h1>
                  <p>Ask me to research any topic. I'll create a plan, gather information, and write a comprehensive report.</p>
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={`message ${msg.role}`}>
                  <MessageContent parts={msg.parts} onArtifactClick={setActiveArtifact} />
                </div>
              ))}

              {(currentParts.length > 0 || isLoading) && (
                <div className="message assistant">
                  {currentParts.length > 0 ? (
                    <MessageContent parts={currentParts} isStreaming onArtifactClick={setActiveArtifact} />
                  ) : (
                    <div className="thinking">
                      <div className="thinking-dots"><span /><span /><span /></div>
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
          <form onSubmit={handleSubmit} className="input-form">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask the research agent..."
              disabled={isLoading}
              rows={1}
            />
            <button type="submit" disabled={isLoading || !input.trim()}>
              {isLoading ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
            </button>
          </form>
        </footer>
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
function updateActivityParts(parts: MessagePart[], activities: Activity[], setter: (parts: MessagePart[]) => void) {
  const newParts = [...parts];
  const lastPart = newParts[newParts.length - 1];
  if (lastPart && lastPart.type === 'activity') {
    lastPart.activities = [...activities];
  } else {
    newParts.push({ type: 'activity', content: '', activities: [...activities] });
  }
  setter(newParts);
}

function getToolDetail(toolData: { name: string; input: Record<string, unknown> }): string {
  const input = toolData.input;
  switch (toolData.name) {
    case 'Read':
    case 'Write':
      return String(input.file_path || '').split('/').pop() || '';
    case 'WebSearch':
      return String(input.query || '').slice(0, 40);
    case 'WebFetch':
      return String(input.url || '').replace(/^https?:\/\//, '').slice(0, 40);
    default:
      return '';
  }
}
