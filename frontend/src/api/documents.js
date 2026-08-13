// src/api/documents.js
import axios from '@/api/axios';

export const fetchPolicies = (params) =>
  axios.get('/api/documents/policies/', { params });

export const uploadPolicy = (formData) =>
  axios.post('/api/documents/policies/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

export const updatePolicy = (id, payload) =>
  axios.patch(`/api/documents/policies/${id}/`, payload);

export const deletePolicy = (id) =>
  axios.delete(`/api/documents/policies/${id}/`);

export const fetchLetterTemplates = (params) =>
  axios.get('/api/documents/templates/', { params });

export const createLetterTemplate = (payload) =>
  axios.post('/api/documents/templates/', payload);

export const updateLetterTemplate = (id, payload) =>
  axios.patch(`/api/documents/templates/${id}/`, payload);

export const generateLetter = (payload) =>
  axios.post('/api/documents/letters/generate/', payload);

export const fetchGeneratedLetters = (params) =>
  axios.get('/api/documents/letters/', { params });

export const fetchGeneratedLetterDetail = (id) =>
  axios.get(`/api/documents/letters/${id}/`);

export const seedLetterTemplates = () =>
  axios.post('/api/documents/templates/seed_defaults/');
