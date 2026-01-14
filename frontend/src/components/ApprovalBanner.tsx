/** Approval Banner - Shows when agent is waiting for user approval */

interface Props {
    plan: string;
    onApprove: () => void;
    onReview: () => void;
    onReject: () => void;
}

export function ApprovalBanner({ plan, onApprove, onReview, onReject }: Props) {
    return (
        <div className="approval-banner">
            <div className="approval-status">
                <span className="spinner">⏳</span>
                <span>Waiting for your approval...</span>
            </div>
            <div className="approval-actions">
                <button className="btn-primary" onClick={onApprove}>Approve</button>
                <button className="btn-secondary" onClick={onReview}>Review & Edit</button>
                <button className="btn-ghost" onClick={onReject}>Cancel</button>
            </div>
        </div>
    );
}
