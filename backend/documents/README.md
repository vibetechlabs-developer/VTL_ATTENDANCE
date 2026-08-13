# Document Management Module API (`documents`)

Provides Policy Document publishing (versioning & single-active-version enforcement), Letter Template management, and placeholder-filled Generated Letter output.

## Endpoints Summary

| Endpoint | Method | Description | Access |
|---|---|---|---|
| `/api/documents/policies/` | `GET, POST` | List policy documents (`?is_active=true` default) / Publish policy (auto-deactivates previous active versions of same title) | Auth / HR Admin write |
| `/api/documents/templates/` | `GET, POST, PUT, DELETE` | CRUD for letter templates (`Offer Letter`, `Relieving Letter`, etc.) | HR / Admin write |
| `/api/documents/letters/` | `GET` | List generated letters (`?scope=mine` or `?employee_id=`) | Authenticated |
| `/api/documents/letters/generate/` | `POST` | Generate filled letter (`{ "template_id": 1, "employee_id": 2 }`) | HR / Admin |

---

## Supported Placeholders

In `LetterTemplate.body_template`:
- `{{employee.name}}`
- `{{employee.designation}}`
- `{{employee.department}}`
- `{{employee.date_of_joining}}`
- `{{employee.employee_code}}`
- `{{employee.phone}}`
- `{{employee.email}}`

---

## PDF Export Note
Generated letters currently store pre-filled HTML/text content in `generated_content`. Exporting directly to PDF file output will require installing a PDF generation library such as `weasyprint` or `reportlab`.
