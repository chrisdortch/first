# Release Boundaries — Version 1.0.0

| Action | Deterministic system | AI/model | Owner |
|---|---:|---:|---:|
| Read source and metadata | Allowed | Allowed | Not required |
| Create isolated candidate branch | Allowed when scoped | Allowed when scoped | Project policy may require approval |
| Run lint, build, and tests | Allowed | May interpret | Not required |
| Run navigation-only browser checks with fixtures | Allowed | May inspect evidence | Not required |
| Produce screenshots and receipts | Allowed | May summarize | Not required |
| Recommend a change | May report | Allowed | Decides |
| Modify application source on an isolated branch | Allowed within explicit task | Allowed within explicit task | Task authorization required |
| Merge to production branch | Never self-authorized | Never self-authorized | Explicit approval required |
| Promote or deploy to production | Never self-authorized | Never self-authorized | Explicit approval required |
| Change domain or DNS | Never self-authorized | Never self-authorized | Explicit approval required |
| Change secrets, access, or credentials | Never self-authorized | Never self-authorized | Explicit approval required |
| Mutate production database or customer data | Never self-authorized | Never self-authorized | Explicit approval required |
| Send email, SMS, social, or legal communication | Never self-authorized | Never self-authorized | Explicit approval required |
| Purchase or create recurring cost | Never self-authorized | Never self-authorized | Explicit approval required |

## Interpretation

“Passing” means the candidate satisfied the encoded checks at the recorded commit. It does not mean the candidate is beautiful, strategically correct, legally sufficient, ready for production, or approved.

Owner approval must identify the project and intended action sufficiently to avoid confusing one branch, deployment, domain, or dataset with another.
