# Exit Management Module API (`exit_management`)

Provides Resignation submissions with auto-calculated last working day and clearance checklist generation, Clearance Item approval tracking, Exit Interviews, and Full & Final Settlement (F&F) preview data.

## Endpoints Summary

| Endpoint | Method | Description | Access |
|---|---|---|---|
| `/api/exit-management/resignations/` | `GET, POST` | List / Submit resignation (auto-generates standard clearance items) | Authenticated |
| `/api/exit-management/resignations/{id}/acknowledge/` | `POST` | Acknowledge resignation and confirm/set approved last working day | Manager / HR Admin |
| `/api/exit-management/resignations/{id}/withdraw/` | `POST` | Employee withdraws pending resignation | Employee / HR Admin |
| `/api/exit-management/resignations/{id}/complete/` | `POST` | Complete exit workflow (requires all clearance items `status=done`) | HR / Admin |
| `/api/exit-management/resignations/{id}/ffs_summary/` | `GET` | Read-only Full & Final Settlement preview (leave balances, last payroll run, clearance checklist status) | Authenticated |
| `/api/exit-management/clearance-items/` | `GET` | List clearance checklist items (`?resignation=`) | Authenticated |
| `/api/exit-management/clearance-items/{id}/mark_done/` | `POST` | Mark clearance item as done with optional remark | HR / Manager / Admin |
| `/api/exit-management/exit-interviews/` | `GET, POST` | Record / View exit interview details | Authenticated |

---

## Default Clearance Items

Automatically created upon resignation submission:
- **IT**: Laptop and asset return
- **IT**: Email and VPN account deactivation
- **Finance**: Dues clearance & expense claims
- **Finance**: Full & Final settlement approval
- **Admin**: ID card & access card surrender
- **Admin**: Drawer/locker keys return
- **HR**: Exit interview completion
- **HR**: Service certificate & relieving letter issuance
