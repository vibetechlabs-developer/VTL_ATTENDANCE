// src/api/exitManagement.js
import axios from "@/api/axios";

// Resignations
export const fetchResignations = (params) =>
  axios.get("/api/exit-management/resignations/", { params });

export const fetchResignationDetail = (id) =>
  axios.get(`/api/exit-management/resignations/${id}/`);

export const submitResignation = (payload) =>
  axios.post("/api/exit-management/resignations/", payload);

export const withdrawResignation = (id) =>
  axios.post(`/api/exit-management/resignations/${id}/withdraw/`);

// Clearance Items
export const fetchClearanceItems = (params) =>
  axios.get("/api/exit-management/clearance-items/", { params });

export const markClearanceDone = (itemId, remark) =>
  axios.post(`/api/exit-management/clearance-items/${itemId}/mark_done/`, { remark });

// Exit Interviews
export const fetchExitInterviews = (params) =>
  axios.get("/api/exit-management/exit-interviews/", { params });

export const createExitInterview = (payload) =>
  axios.post("/api/exit-management/exit-interviews/", payload);

export const fetchExitInterviewDetail = (id) =>
  axios.get(`/api/exit-management/exit-interviews/${id}/`);

