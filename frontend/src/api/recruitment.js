// src/api/recruitment.js
import axios from '@/api/axios';

// Job Openings
export const fetchJobOpenings = (params) =>
  axios.get('/api/recruitment/openings/', { params });

export const fetchJobOpening = (id) =>
  axios.get(`/api/recruitment/openings/${id}/`);

export const createJobOpening = (payload) =>
  axios.post('/api/recruitment/openings/', payload);

export const updateJobOpening = (id, payload) =>
  axios.patch(`/api/recruitment/openings/${id}/`, payload);

export const toggleJobStatus = (id, status) =>
  axios.post(`/api/recruitment/openings/${id}/toggle_status/`, { status });

// Candidates
export const fetchCandidates = (params) =>
  axios.get('/api/recruitment/candidates/', { params });

export const createCandidate = (formData) =>
  axios.post('/api/recruitment/candidates/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

export const applyCandidateToJob = (candidateId, jobId) =>
  axios.post(`/api/recruitment/candidates/${candidateId}/apply/`, { job_id: jobId });

// Applications – flat list with ?job=<id> filter
export const fetchApplications = (params) =>
  axios.get('/api/recruitment/applications/', { params });

export const fetchJobApplicationDetail = (id) =>
  axios.get(`/api/recruitment/applications/${id}/`);

export const moveApplicationStage = (appId, newStage) =>
  axios.post(`/api/recruitment/applications/${appId}/move_stage/`, { stage: newStage });

// Interviews
export const fetchInterviews = (params) =>
  axios.get('/api/recruitment/interviews/', { params });

export const createInterview = (payload) =>
  axios.post('/api/recruitment/interviews/', payload);

export const submitInterviewFeedback = (payload) =>
  axios.post(`/api/recruitment/interviews/${payload.interview}/feedback/`, {
    rating: payload.rating,
    notes: payload.notes,
  });
