/** Approval Card - Plan display with approve/edit/reject actions */

import { useState } from 'react';

interface Plan {
    title: string;
    goal: string;
    searchQuery: string;
}

interface Props {
    plan: Plan;
    onApprove: (modifiedPlan?: string) => void;
    onReject: () => void;
}

export function ApprovalCard({ plan, onApprove, onReject }: Props) {
    const [isEditing, setIsEditing] = useState(false);
    const [edited, setEdited] = useState(JSON.stringify(plan, null, 2));

    return (
        <div className="approval-card">
            <div className="card-header">
                <span className="icon">📋</span>
                <h3>Research Plan</h3>
            </div>
            <div className="card-content">
                {isEditing ? (
                    <textarea
                        value={edited}
                        onChange={e => setEdited(e.target.value)}
                        className="plan-editor"
                    />
                ) : (
                    <div className="plan-display">
                        <h4>{plan.title}</h4>
                        <p><strong>Goal:</strong> {plan.goal}</p>
                        <p><strong>Search:</strong> {plan.searchQuery}</p>
                    </div>
                )}
            </div>
            <div className="card-footer">
                {isEditing ? (
                    <>
                        <button className="btn-primary" onClick={() => { onApprove(edited); setIsEditing(false); }}>
                            Save & Approve
                        </button>
                        <button className="btn-secondary" onClick={() => setIsEditing(false)}>
                            Cancel
                        </button>
                    </>
                ) : (
                    <>
                        <button className="btn-primary" onClick={() => onApprove()}>
                            Approve
                        </button>
                        <button className="btn-secondary" onClick={() => setIsEditing(true)}>
                            Edit Plan
                        </button>
                        <button className="btn-ghost" onClick={onReject}>
                            Reject
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
