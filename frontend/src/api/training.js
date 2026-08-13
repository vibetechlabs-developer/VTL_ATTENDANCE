// src/api/training.js
import axios from "@/api/axios";

// Programs
export const fetchPrograms = (params) =>
  axios.get("/api/training/programs/", { params });

export const fetchProgramDetail = (id) =>
  axios.get(`/api/training/programs/${id}/`);

export const createProgram = (payload) =>
  axios.post("/api/training/programs/", payload);

export const updateProgram = (id, payload) =>
  axios.patch(`/api/training/programs/${id}/`, payload);

export const deleteProgram = (id) =>
  axios.delete(`/api/training/programs/${id}/`);

// Enrollments
export const fetchEnrollments = (params) =>
  axios.get("/api/training/enrollments/", { params });

export const enrollInProgram = (payload) =>
  axios.post("/api/training/enrollments/", payload);

export const markAttendance = (enrollmentId, attended) =>
  axios.patch(`/api/training/enrollments/${enrollmentId}/`, { attended });

export const bulkEnroll = (programId, departmentId) =>
  axios.post(`/api/training/programs/${programId}/bulk_enroll/`, {
    department_id: departmentId,
  });

// Feedback
export const fetchFeedback = (params) =>
  axios.get("/api/training/feedback/", { params });

export const submitFeedback = (payload) =>
  axios.post("/api/training/feedback/", payload);
