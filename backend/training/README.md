# Training & Development Module API (`training`)

Provides Training Programs management, self-enrollment & bulk-enrollment, attendance marking, feedback ratings, and program summaries.

## Endpoints Summary

| Endpoint | Method | Description | Access |
|---|---|---|---|
| `/api/training/programs/` | `GET, POST` | List programs (auto-filtered by employee department) / Create program | Auth / HR Admin write |
| `/api/training/programs/{id}/bulk_enroll/` | `POST` | Bulk enroll all employees in a department (`{ "department": "Engineering" }`) | HR / Admin |
| `/api/training/programs/{id}/summary/` | `GET` | Get program stats (enrolled count, attended count, average feedback rating) | Authenticated |
| `/api/training/enrollments/` | `GET, POST` | List / Self-enroll in a training program | Authenticated |
| `/api/training/enrollments/{id}/mark_attended/` | `POST` | Mark attendance after program date | Program Creator / HR / Admin |
| `/api/training/enrollments/{id}/submit_feedback/` | `POST` | Submit rating (1-5) and feedback comment (only after `attended=True`) | Enrolled Employee / Admin |
