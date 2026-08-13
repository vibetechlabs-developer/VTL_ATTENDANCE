# Recruitment / ATS Module API (`recruitment`)

The `recruitment` app provides Job Openings management, Candidate tracking, Application workflows, and Interview scheduling with feedback/rating collection.

## Endpoints Summary

| Endpoint | Method | Description | Access |
|---|---|---|---|
| `/api/recruitment/openings/` | `GET` | List job openings (public view lists `status=open` if unauthenticated; authenticated users can filter via `?status=`) | Public / Authenticated |
| `/api/recruitment/openings/` | `POST` | Create job opening | HR / Admin |
| `/api/recruitment/openings/{id}/` | `GET, PUT, PATCH, DELETE` | Detail/Edit/Delete job opening | Posted by / HR / Admin |
| `/api/recruitment/candidates/` | `GET, POST` | List / Create candidate (supports multipart file upload for `resume`) | Authenticated |
| `/api/recruitment/candidates/{id}/` | `GET, PUT, PATCH, DELETE` | Candidate detail & management | Authenticated |
| `/api/recruitment/applications/` | `GET, POST` | List applications (`?job_opening=&stage=`) / Apply candidate to job | Authenticated |
| `/api/recruitment/applications/{id}/move_stage/` | `POST` | Update application stage (`applied`, `shortlisted`, `interview`, `offered`, `rejected`, `hired`) | Authenticated |
| `/api/recruitment/applications/{id}/convert_to_employee/` | `POST` | Get pre-formatted candidate payload for employee creation | Authenticated |
| `/api/recruitment/interviews/` | `GET, POST` | Schedule interview with panel members | Authenticated |
| `/api/recruitment/interviews/{id}/submit_feedback/` | `POST` | Submit interview feedback & rating (1-5) after scheduled time | Panel Member / HR / Admin |

---

## Example Payloads & Responses

### 1. Create Job Opening
`POST /api/recruitment/openings/`
```json
{
  "title": "Backend Python Developer",
  "department": "Engineering",
  "location": "Ahmedabad / Remote",
  "experience_required": "2-4 years",
  "description": "Looking for Django / DRF expert",
  "status": "open",
  "closing_date": "2026-09-30"
}
```

### 2. Move Application Stage
`POST /api/recruitment/applications/1/move_stage/`
```json
{
  "stage": "shortlisted"
}
```

### 3. Convert Application to Employee Payload
`POST /api/recruitment/applications/1/convert_to_employee/`
**Response (200 OK):**
```json
{
  "message": "Candidate data formatted for Employee creation.",
  "employee_payload": {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "phone": "9876543210",
    "department": "Engineering",
    "designation": "Backend Python Developer",
    "employment_status": "active",
    "grade": "A1"
  }
}
```

### 4. Submit Interview Feedback
`POST /api/recruitment/interviews/1/submit_feedback/`
```json
{
  "feedback": "Strong Python knowledge and good communication skills.",
  "rating": 4
}
```
