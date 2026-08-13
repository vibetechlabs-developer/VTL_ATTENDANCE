# Employee Self-Service (ESS) Portal API (`ess`)

Aggregates employee attendance, leave balances, pending tasks, and provides Profile Change Requests & HR Support Ticketing.

## Endpoints Summary

| Endpoint | Method | Description | Access |
|---|---|---|---|
| `/api/ess/dashboard/` | `GET` | Aggregated dashboard: today's attendance, leave balances, tasks, pending approvals | Authenticated |
| `/api/ess/profile-changes/` | `GET, POST` | List (`?scope=mine|pending_review`) / Request profile field change | Authenticated |
| `/api/ess/profile-changes/{id}/approve/` | `POST` | Approves and updates target field on Employee record via whitelist check | HR / Admin |
| `/api/ess/profile-changes/{id}/reject/` | `POST` | Rejects change request | HR / Admin |
| `/api/ess/tickets/` | `GET, POST` | List / Create HR Support Tickets (with optional file attachment) | Authenticated |
| `/api/ess/tickets/{id}/assign/` | `POST` | Assign ticket to HR staff (`{ "assigned_to": employee_id }`) | HR / Admin |
| `/api/ess/tickets/{id}/resolve/` | `POST` | Mark ticket as resolved | Assigned HR / Author / Admin |
| `/api/ess/comments/` | `POST` | Add comment on ticket (`{ "ticket": id, "text": "..." }`) | Authenticated |

---

## Sensitive Fields & Whitelist

Constant in `ess/models.py`:
- Sensitive fields: `bank_account_number`, `bank_name`, `ifsc_code`, `pan_number`, `aadhaar_number`, `salary`, `grade`
- Allowed change fields: `phone`, `address`, `designation`, `name` + sensitive fields
