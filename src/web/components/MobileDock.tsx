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
      <button onClick={props.onThreads}>Threads</button>
      <button onClick={props.onChat}>Chat</button>
      <button onClick={props.onReview}>Review</button>
      <button onClick={props.onActivity}>Activity{props.approvalCount ? <span>{props.approvalCount}</span> : null}</button>
      <button className="primary" onClick={props.onNewThread}>＋</button>
    </nav>
  );
}
