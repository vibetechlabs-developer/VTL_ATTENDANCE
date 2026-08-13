# Leave Management Module API (`leave`)

Provides Leave Types, Leave Balances, Leave Applications with overlap/balance checks and approval workflows, and Holiday calendars.

## Endpoints Summary

| Endpoint | Method | Description | Access |
|---|---|---|---|
| `/api/leave/types/` | `GET, POST` | List / Create leave types | Authenticated / Admin write |
| `/api/leave/balances/` | `GET` | Read-only list (`?scope=mine` or `?employee_id=`) | Authenticated |
| `/api/leave/applications/` | `GET, POST` | List (`?scope=mine|team&status=`) / Submit leave application | Authenticated |
| `/api/leave/applications/{id}/approve/` | `POST` | Approve leave application and deduct balance | Manager / HR Admin |
| `/api/leave/applications/{id}/reject/` | `POST` | Reject leave application (restore balance if previously approved) | Manager / HR Admin |
| `/api/leave/applications/{id}/cancel/` | `POST` | Employee cancels their pending/approved leave | Employee / HR Admin |
| `/api/leave/holidays/` | `GET, POST` | List / Create holidays | Authenticated / Admin write |

---

## Management Command

Run monthly leave accrual:
```bash
python manage.py accrue_leave
```
