# Payroll Management Module API (`payroll`)

Provides Salary Components, Salary Structures, Payroll Run generation (prorating by LOP leave & attendance), and Payslips breakdown.

## Endpoints Summary

| Endpoint | Method | Description | Access |
|---|---|---|---|
| `/api/payroll/components/` | `GET, POST` | List / Create salary components | Authenticated / Admin write |
| `/api/payroll/structures/` | `GET, POST` | List / Create employee salary structure | Authenticated / Admin write |
| `/api/payroll/runs/` | `GET` | List payroll runs | Authenticated |
| `/api/payroll/runs/generate/` | `POST` | Generate payslips for month/year (`{month, year}`) | HR / Admin |
| `/api/payroll/runs/{id}/finalize/` | `POST` | Lock payroll run to prevent further changes | HR / Admin |
| `/api/payroll/payslips/` | `GET` | Read-only payslips list (`?scope=mine`, `?employee_id=`) | Authenticated |
| `/api/payroll/payslips/{id}/` | `GET` | Payslip detailed JSON breakdown | Authenticated |
