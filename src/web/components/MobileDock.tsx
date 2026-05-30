export function MobileDock(props: {
  approvalCount: number;
  onThreads: () => void;
  onChat: () => void;
  onReview: () => void;
  onActivity: () => void;
  onNewThread: () => void;
}) {
  return (
    <nav className="mobile-dock" aria-label="Mobile navigation">
      <button onClick={props.onThreads} title="Threads" aria-label="Threads">☰</button>
      <button onClick={props.onChat} title="Chat" aria-label="Chat">◯</button>
      <button onClick={props.onReview} title="Review" aria-label="Review">✓</button>
      <button onClick={props.onActivity} title="Activity" aria-label="Activity">
        ◷{props.approvalCount ? <span>{props.approvalCount}</span> : null}
      </button>
      <button className="primary" onClick={props.onNewThread} title="New thread" aria-label="New thread">＋</button>
    </nav>
  );
}
