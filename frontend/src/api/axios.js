import axios from 'axios';
import { useAuthStore } from '@/store/authStore';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

const instance = axios.create({
  baseURL: API_BASE,
});

instance.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

instance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = useAuthStore.getState().refreshToken;

      if (refreshToken) {
        try {
          const res = await axios.post(`${API_BASE}/api/users/token/refresh/`, {
            refresh: refreshToken,
          });
          const newAccessToken = res.data.access;
          if (newAccessToken) {
            useAuthStore.getState().setAccessToken(newAccessToken);
            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
            return instance(originalRequest);
          }
        } catch (refreshErr) {
          useAuthStore.getState().clearSession();
          window.location.href = '/login';
          return Promise.reject(refreshErr);
        }
      }
      useAuthStore.getState().clearSession();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default instance;
