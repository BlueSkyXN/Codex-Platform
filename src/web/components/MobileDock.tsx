import { Icon } from './Icon.js';

type MobileDockTarget = 'threads' | 'chat' | 'review' | 'activity';

export function MobileDock(props: {
  approvalCount: number;
  active?: MobileDockTarget;
  onThreads: () => void;
  onChat: () => void;
  onReview: () => void;
  onActivity: () => void;
  onNewThread: () => void;
}) {
  return (
    <nav className="mobile-dock" aria-label="Mobile navigation">
      <button className={props.active === 'threads' ? 'active' : ''} onClick={props.onThreads} title="Threads" aria-label="Threads"><Icon name="menu" size={16} /></button>
      <button className={props.active === 'chat' ? 'active' : ''} onClick={props.onChat} title="Chat" aria-label="Chat"><Icon name="chat" size={16} /></button>
      <button className={props.active === 'review' ? 'active' : ''} onClick={props.onReview} title="Review" aria-label="Review"><Icon name="check" size={16} /></button>
      <button className={props.active === 'activity' ? 'active' : ''} onClick={props.onActivity} title="Activity" aria-label="Activity">
        <Icon name="clock" size={16} />{props.approvalCount ? <span>{props.approvalCount}</span> : null}
      </button>
      <button className="primary" onClick={props.onNewThread} title="New thread" aria-label="New thread"><Icon name="plus" size={17} /></button>
    </nav>
  );
}
