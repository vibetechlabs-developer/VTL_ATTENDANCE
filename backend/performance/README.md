# Performance Management Module API (`performance`)

The `performance` app handles Appraisal Cycles, Goal setting with weightage validation, Self Assessments, Manager Reviews, and Overall Rating computation.

## Endpoints Summary

| Endpoint | Method | Description | Access |
|---|---|---|---|
| `/api/performance/cycles/` | `GET, POST` | List / Create Appraisal Cycles | Auth / HR Admin write |
| `/api/performance/goals/` | `GET, POST` | List goals (`?scope=mine`, `?employee_id=`, `?cycle_id=`) / Create goal | Authenticated |
| `/api/performance/goals/{id}/self_assess/` | `POST` | Employee submits self rating (1-5) and comment | Employee / HR Admin |
| `/api/performance/goals/{id}/manager_review/` | `POST` | Manager submits manager rating (1-5) and comment | Manager / HR Admin |
| `/api/performance/appraisals/` | `GET` | List appraisals (`?scope=mine`, `?employee_id=`, `?cycle_id=`) | Authenticated |
| `/api/performance/appraisals/{id}/submit_self_assessment/` | `POST` | Validates goals sum to 100% and flips status to `manager_review_pending` | Employee / HR Admin |
| `/api/performance/appraisals/{id}/finalize/` | `POST` | Computes final overall rating and flips status to `completed` | Manager / HR Admin |

---

## Example Payloads & Responses

### 1. Create Goal for Employee
`POST /api/performance/goals/`
```json
{
  "cycle": 1,
  "employee": 2,
  "title": "Deliver ATS module",
  "description": "Build recruitment models and endpoints",
  "target_metric": "100% unit tests passing and documentation complete",
  "weightage": 50
}
```

### 2. Submit Self Assessment on a Goal
`POST /api/performance/goals/1/self_assess/`
```json
{
  "self_rating": 4,
  "self_comment": "Delivered all endpoints on time."
}
```

### 3. Submit Self Assessment for Entire Appraisal (Submit to Manager)
`POST /api/performance/appraisals/1/submit_self_assessment/`
**Response (Error if weightage != 100):**
```json
{
  "error": "Sum of goal weightage must equal 100% before submitting self-assessment. Current total: 70%.",
  "current_total": 70
}
```

### 4. Finalize Appraisal (Manager Action)
`POST /api/performance/appraisals/1/finalize/`
**Response (200 OK):**
```json
{
  "id": 1,
  "cycle": 1,
  "cycle_name": "Q3 2026",
  "employee": 2,
  "employee_name": "John Doe",
  "overall_rating": 4.5,
  "status": "completed",
  "finalized_by": 1,
  "finalized_by_name": "Manager User",
  "finalized_on": "2026-08-05T12:00:00Z",
  "goals": [...]
}
```
