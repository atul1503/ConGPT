import { useEffect, useState } from "react";
import "./App.css";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:8000";

const ROLE_META = {
  user: { label: "You", badge: "U" },
  assistant: { label: "Assistant", badge: "AI" },
};

function formatRelativeTime(isoString) {
  if (!isoString) return "";
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diff = then - now;
  const absDiff = Math.abs(diff);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (absDiff < minute) {
    const seconds = Math.round(diff / 1000);
    return formatter.format(seconds, "second");
  }

  if (absDiff < hour) {
    const minutes = Math.round(diff / minute);
    return formatter.format(minutes, "minute");
  }

  if (absDiff < day) {
    const hours = Math.round(diff / hour);
    return formatter.format(hours, "hour");
  }

  const days = Math.round(diff / day);
  return formatter.format(days, "day");
}

function PostCard({
  node,
  nodes,
  onExpandPost,
  onGoToParent,
  onDeleteChild,
  isParent = false,
  isChild = false,
  disableActions = false,
}) {
  const meta = ROLE_META[node.role];
  const children = (node.children || [])
    .map((childId) => nodes[childId])
    .filter(Boolean);
  
  const hasParent = !!node.parentId;
  const replyCount = children.length;
  const expandLabel =
    replyCount === 0
      ? "Expand post"
      : `Expand post (${replyCount} ${replyCount === 1 ? "reply" : "replies"})`;

  return (
    <div className={`post-card ${node.role} ${isParent ? 'post-card--parent' : ''} ${isChild ? 'post-card--child' : ''}`}>
      <div className="post-card__avatar">{meta.badge}</div>
      <div className="post-card__body">
        <div className="post-card__meta">
          <span className="post-card__author">{meta.label}</span>
          <span className="post-card__time">
            {formatRelativeTime(node.createdAt)}
          </span>
        </div>
        <p className="post-card__content">{node.content}</p>
        
        <div className="post-card__actions">
          {hasParent && !isChild && (
            <button
              className="post-card__action-btn post-card__parent"
              type="button"
              onClick={() => onGoToParent(node.parentId)}
              disabled={disableActions}
            >
              ↑ Go to parent
            </button>
          )}
          
          {!isParent && (
            <button
              className="post-card__action-btn post-card__expand"
              type="button"
              onClick={() => onExpandPost(node.id)}
              disabled={disableActions}
            >
              {expandLabel}
            </button>
          )}

          {isChild && onDeleteChild && (
            <button
              className="post-card__action-btn post-card__delete"
              type="button"
              onClick={() => onDeleteChild(node.id)}
              disabled={disableActions}
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function App() {
  const [state, setState] = useState({ rootIds: [], nodes: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [composer, setComposer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [focusedPost, setFocusedPost] = useState(null); // null = show all threads

  useEffect(() => {
    const loadThreads = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${API_BASE}/threads`);
        if (!response.ok) {
          throw new Error("Failed to load threads.");
        }
        const data = await response.json();
        setState(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadThreads();
  }, []);

  const sendMessage = async (content, parentId = null) => {
    const response = await fetch(`${API_BASE}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, parentId }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Failed to send message.");
    }

    const payload = await response.json();
    if (payload.state) {
      setState(payload.state);
    }
    return payload;
  };

  const handleSubmit = async (event) => {
    if (event) event.preventDefault();
    const content = composer.trim();
    if (!content) return;

    try {
      setSubmitting(true);
      setError(null);
      // Reply to the current parent (focused post) or create new root thread
      const parentId = currentView.parent ? currentView.parent.id : null;
      const payload = await sendMessage(content, parentId);
      setComposer("");
      // Stay on the same view after posting
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleExpandPost = (nodeId) => {
    setFocusedPost(nodeId);
  };

  const handleGoToParent = (parentId) => {
    setFocusedPost(parentId);
  };

  const handleBackToAll = () => {
    setFocusedPost(null);
  };

  const handleDeleteChild = async (childId) => {
    try {
      setSubmitting(true);
      setError(null);
      const response = await fetch(`${API_BASE}/messages/${childId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Failed to delete message.");
      }
      const payload = await response.json();
      if (payload.state) {
        setState(payload.state);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Get current parent and its children
  const getCurrentView = () => {
    if (!focusedPost) {
      // Show all root threads as potential parents
      return {
        parent: null,
        children: state.rootIds.map((id) => state.nodes[id]).filter(Boolean)
      };
    }
    
    // Show focused post as parent with its immediate children
    const parent = state.nodes[focusedPost];
    if (!parent) return { parent: null, children: [] };
    
    const children = (parent.children || [])
      .map((childId) => state.nodes[childId])
      .filter(Boolean);
    
    return { parent, children };
  };

  const currentView = getCurrentView();

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__title">
          <h1>ConGPT</h1>
          {focusedPost && (
            <button 
              className="app-header__back"
              onClick={handleBackToAll}
            >
              ← Back to all threads
            </button>
          )}
        </div>
      </header>

      <main className="app-main">
        {error && <div className="app-error">{error}</div>}

        {loading ? (
          <div className="app-empty">Loading conversation…</div>
        ) : !focusedPost && currentView.children.length === 0 ? (
          <div className="single-level-view">
            <div className="reply-composer">
              <textarea
                placeholder="What's on your mind?"
                value={composer}
                onChange={(event) => setComposer(event.target.value)}
                disabled={submitting}
                rows={4}
                className="reply-composer__textarea"
              />
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || composer.trim().length === 0}
                className="reply-composer__button"
              >
                {submitting ? "Asking…" : "Ask"}
              </button>
            </div>
          </div>
        ) : (
          <div className="single-level-view">
            {/* Parent Post */}
            {currentView.parent && (
              <div className="parent-post">
                <PostCard
                  node={currentView.parent}
                  nodes={state.nodes}
                  onExpandPost={handleExpandPost}
                  onGoToParent={handleGoToParent}
                  isParent={true}
                  disableActions={submitting}
                />
      </div>
            )}
            
            {/* Reply Composer */}
            <div className="reply-composer">
              <textarea
                placeholder={currentView.parent ? `Reply to ${ROLE_META[currentView.parent.role].label}...` : "What's on your mind?"}
                value={composer}
                onChange={(event) => setComposer(event.target.value)}
                disabled={submitting}
                rows={3}
                className="reply-composer__textarea"
              />
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || composer.trim().length === 0}
                className="reply-composer__button"
              >
                {submitting ? "Asking…" : "Ask"}
        </button>
            </div>
            
            {/* Children Posts */}
            {currentView.children.length > 0 && (
              <div className="children-posts">
                {currentView.children.map((child) => (
                  <div key={child.id} className="child-post">
                    <PostCard
                      node={child}
                      nodes={state.nodes}
                      onExpandPost={handleExpandPost}
                      onGoToParent={handleGoToParent}
                      isChild={true}
                      onDeleteChild={handleDeleteChild}
                      disableActions={submitting}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
      </div>
  );
}

export default App;

