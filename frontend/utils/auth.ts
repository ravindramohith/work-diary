"use client";

import axios from "axios";

const BASE_URL = `${process.env.NEXT_PUBLIC_BACKEND_URL}`;

export const getToken = (): string | null => {
  const cookies = document.cookie.split(";");
  const tokenCookie = cookies.find((cookie) =>
    cookie.trim().startsWith("token=")
  );
  return tokenCookie ? decodeURIComponent(tokenCookie.split("=")[1]) : null;
};

export const setToken = (token: string): void => {
  document.cookie = `token=${token}; path=/; max-age=${7 * 24 * 60 * 60}`; // 7 days
};

export const removeToken = (): void => {
  document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
};

export const isAuthenticated = (): boolean => {
  return !!getToken();
};

export const checkAuth = async () => {
  const token = getToken();
  if (!token) return null;

  try {
    const response = await axios.get(`${BASE_URL}/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
      withCredentials: true,
    });
    return response.data;
  } catch (error) {
    removeToken();
    return null;
  }
};

export const checkSlackConnection = async () => {
  const token = getToken();
  if (!token) return false;

  try {
    const response = await axios.get(`${BASE_URL}/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
      withCredentials: true,
    });
    return !!response.data.slack_user_id;
  } catch (error) {
    return false;
  }
};

// Helper function for authenticated axios requests
export const authenticatedRequest = async (url: string, options: any = {}) => {
  const token = getToken();
  return axios({
    url: url.startsWith("http") ? url : `${BASE_URL}${url}`,
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
    withCredentials: true,
  });
};
