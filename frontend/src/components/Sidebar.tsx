import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Plus, MessageSquare, Trash2 } from "lucide-react";

interface SidebarProps {
    activeThreadId: Id<"threads"> | null;
    onSelectThread: (threadId: Id<"threads">) => void;
    onNewThread: () => void;
}

export function Sidebar({ activeThreadId, onSelectThread, onNewThread }: SidebarProps) {
    const threads = useQuery(api.threads.list);
    const removeThread = useMutation(api.threads.remove);

    const handleDelete = (e: React.MouseEvent, threadId: Id<"threads">) => {
        e.stopPropagation();
        if (confirm("Delete this research session?")) {
            removeThread({ threadId });
        }
    };

    const formatDate = (timestamp: number) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (days === 0) return "Today";
        if (days === 1) return "Yesterday";
        if (days < 7) return `${days} days ago`;
        return date.toLocaleDateString();
    };

    return (
        <aside className="sidebar">
            <div className="sidebar-header">
                <h2>Research Sessions</h2>
                <button className="new-thread-btn" onClick={onNewThread}>
                    <Plus size={16} />
                    New
                </button>
            </div>

            <div className="thread-list">
                {threads === undefined ? (
                    <div className="loading-threads">Loading...</div>
                ) : threads.length === 0 ? (
                    <div className="empty-threads">
                        <MessageSquare size={24} />
                        <p>No research sessions yet</p>
                        <button onClick={onNewThread}>Start your first research</button>
                    </div>
                ) : (
                    threads.map((thread) => (
                        <button
                            key={thread._id}
                            className={`thread-item ${activeThreadId === thread._id ? "active" : ""}`}
                            onClick={() => onSelectThread(thread._id)}
                        >
                            <div className="thread-info">
                                <span className="thread-title">{thread.title}</span>
                                <span className="thread-date">{formatDate(thread.updatedAt)}</span>
                            </div>
                            <button
                                className="delete-btn"
                                onClick={(e) => handleDelete(e, thread._id)}
                            >
                                <Trash2 size={14} />
                            </button>
                        </button>
                    ))
                )}
            </div>
        </aside>
    );
}
