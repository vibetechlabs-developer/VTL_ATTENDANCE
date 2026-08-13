// src/api/employees.js
import axios from "@/api/axios";

// Employees
export const fetchEmployees = (params) =>
  axios.get("/api/users/employees/", { params });

export const fetchEmployeeDetail = (id) =>
  axios.get(`/api/users/employees/${id}/`);

export const createEmployee = (payload) =>
  axios.post("/api/users/employees/", payload);

export const updateEmployee = (id, payload) =>
  axios.patch(`/api/users/employees/${id}/`, payload);

// Departments
export const fetchDepartments = (params) =>
  axios.get("/api/users/departments/", { params });

export const fetchDepartmentDetail = (id) =>
  axios.get(`/api/users/departments/${id}/`);

export const createDepartment = (payload) =>
  axios.post("/api/users/departments/", payload);

// Designations
export const fetchDesignations = (params) =>
  axios.get("/api/users/designations/", { params });

// Profile change requests
export const fetchProfileChangeRequests = (params) =>
  axios.get("/api/ess/profile-change-requests/", { params });

export const submitProfileChangeRequest = (payload) =>
  axios.post("/api/ess/profile-change-requests/", payload);

export const approveProfileChangeRequest = (id) =>
  axios.post(`/api/ess/profile-change-requests/${id}/approve/`);

export const rejectProfileChangeRequest = (id, reason) =>
  axios.post(`/api/ess/profile-change-requests/${id}/reject/`, { reason });
