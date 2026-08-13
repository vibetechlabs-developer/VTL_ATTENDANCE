// src/api/payroll.js
import axios from "@/api/axios";

// Payslips
export const fetchPayslips = (params) =>
  axios.get("/api/payroll/payslips/", { params });

export const fetchPayslipDetail = (id) =>
  axios.get(`/api/payroll/payslips/${id}/`);

// Payroll Runs
export const fetchPayrollRuns = (params) =>
  axios.get("/api/payroll/payroll-runs/", { params });

export const generatePayrollRun = (payload) =>
  axios.post("/api/payroll/payroll-runs/generate/", payload);

export const finalizePayrollRun = (id) =>
  axios.post(`/api/payroll/payroll-runs/${id}/finalize/`);

// Salary Structures
export const fetchSalaryStructures = (params) =>
  axios.get("/api/payroll/salary-structures/", { params });

export const fetchSalaryComponents = (params) =>
  axios.get("/api/payroll/salary-components/", { params });

// Payslip Revision
export const revisePayslip = (id, payload) =>
  axios.post(`/api/payroll/payslips/${id}/revise/`, payload);

// Policy & Settings
export const fetchPayrollPolicy = () =>
  axios.get("/api/payroll/policy/");

export const updatePayrollPolicy = (payload) =>
  axios.post("/api/payroll/policy/", payload);

export const fetchStatutoryConfig = () =>
  axios.get("/api/payroll/statutory-config/");

export const updateStatutoryConfig = (payload) =>
  axios.post("/api/payroll/statutory-config/", payload);

export const fetchPTSlabs = () =>
  axios.get("/api/payroll/pt-slabs/");

export const createPTSlab = (payload) =>
  axios.post("/api/payroll/pt-slabs/", payload);

export const fetchLoans = (params) =>
  axios.get("/api/payroll/loans/", { params });

export const fetchReimbursements = (params) =>
  axios.get("/api/payroll/reimbursements/", { params });

