// src/api/performance.js
import axios from '@/api/axios';

export const fetchCycles = (params) =>
  axios.get('/api/performance/cycles/', { params });

export const createCycle = (payload) =>
  axios.post('/api/performance/cycles/', payload);

export const fetchActiveCycle = () =>
  axios.get('/api/performance/cycles/active/');

export const fetchGoals = (params) =>
  axios.get('/api/performance/goals/', { params });

export const createGoal = (payload) =>
  axios.post('/api/performance/goals/', payload);

export const updateGoal = (id, payload) =>
  axios.patch(`/api/performance/goals/${id}/`, payload);

export const deleteGoal = (id) =>
  axios.delete(`/api/performance/goals/${id}/`);

export const fetchMyAppraisal = () =>
  axios.get('/api/performance/my-appraisal/');

export const submitSelfRating = (goalId, payload) =>
  axios.post(`/api/performance/goals/${goalId}/self_rate/`, payload);

export const submitSelfAssessment = (payload) =>
  axios.post('/api/performance/my-appraisal/self-assessment/', payload);

export const fetchTeamAppraisals = () =>
  axios.get('/api/performance/team-appraisals/');

export const submitManagerRating = (goalId, payload) =>
  axios.post(`/api/performance/goals/${goalId}/manager_rate/`, payload);

export const finalizeAppraisal = (employeeId) =>
  axios.post(`/api/performance/team-appraisals/${employeeId}/finalize/`);

export const evaluateFactors = (appraisalId, payload) =>
  axios.post(`/api/performance/appraisals/${appraisalId}/evaluate_factors/`, payload);

export const fetchAppraisals = (params) =>
  axios.get('/api/performance/appraisals/', { params });

export const downloadAppraisalPdf = (appraisalId) =>
  axios.get(`/api/performance/appraisals/${appraisalId}/pdf/`, { responseType: 'blob' })
    .then(res => {
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Appraisal_${appraisalId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    });

export const updateCycle = (id, payload) =>
  axios.patch(`/api/performance/cycles/${id}/`, payload);
