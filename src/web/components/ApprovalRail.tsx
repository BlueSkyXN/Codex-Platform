import type { ApprovalDecision, ApprovalRequest } from '../../shared/types.js';

const defaultDecisions: ApprovalDecision[] = ['decline', 'accept', 'acceptForSession', 'cancel'];

export function ApprovalRail(props: {
  approvals: ApprovalRequest[];
  onDecision: (requestId: string | number, decision: ApprovalDecision) => void;
  onFocusApproval?: (approval: ApprovalRequest) => void;
}) {
  if (props.approvals.length === 0) return null;
  return (
    <div className="approval-rail">
      {props.approvals.map((approval) => {
        const decisions = approval.availableDecisions?.length ? approval.availableDecisions : defaultDecisions;
        return (
          <div className="approval-card" key={String(approval.requestId)}>
            <button className="approval-title approval-focus-button" onClick={() => props.onFocusApproval?.(approval)}>{approval.title}</button>
            {approval.reason ? <div className="approval-reason">{approval.reason}</div> : null}
            {approval.command ? <pre className="approval-command">{approval.command}</pre> : null}
            {approval.grantRoot ? <div className="mono subtle">grant root: {approval.grantRoot}</div> : null}
            <div className="approval-actions">
              {decisions.includes('decline') ? <button onClick={() => props.onDecision(approval.requestId, 'decline')}>Deny</button> : null}
              {decisions.includes('accept') ? <button onClick={() => props.onDecision(approval.requestId, 'accept')}>Allow once</button> : null}
              {decisions.includes('acceptForSession') ? <button className="primary" onClick={() => props.onDecision(approval.requestId, 'acceptForSession')}>Allow session</button> : null}
              {decisions.includes('cancel') ? <button onClick={() => props.onDecision(approval.requestId, 'cancel')}>Cancel turn</button> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
