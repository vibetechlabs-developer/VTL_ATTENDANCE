// src/api/ess.js
import axios from '@/api/axios';

export const fetchEssDashboard = () =>
  axios.get('/api/ess/dashboard/');

export const fetchProfileChangeRequests = (params) =>
  axios.get('/api/ess/profile-changes/', { params });

export const createProfileChangeRequest = (payload) =>
  axios.post('/api/ess/profile-changes/', payload);

export const approveProfileChangeRequest = (id) =>
  axios.post(`/api/ess/profile-changes/${id}/approve/`);

export const rejectProfileChangeRequest = (id) =>
  axios.post(`/api/ess/profile-changes/${id}/reject/`);

export const fetchTickets = (params) =>
  axios.get('/api/ess/tickets/', { params });

export const fetchTicketDetail = (id) =>
  axios.get(`/api/ess/tickets/${id}/`);

export const createTicket = (formData) =>
  axios.post('/api/ess/tickets/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

export const assignTicket = (id, assignedTo) =>
  axios.post(`/api/ess/tickets/${id}/assign/`, { assigned_to: assignedTo });

export const resolveTicket = (id) =>
  axios.post(`/api/ess/tickets/${id}/resolve/`);

export const reopenTicket = (id) =>
  axios.post(`/api/ess/tickets/${id}/reopen/`);


export const createTicketComment = (payload) =>
  axios.post('/api/ess/comments/', payload);
