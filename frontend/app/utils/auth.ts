export function getToken(): string | null {
  // Get token from cookie
  const cookies = document.cookie.split(";");
  const tokenCookie = cookies.find((cookie) =>
    cookie.trim().startsWith("token=")
  );
  return tokenCookie ? tokenCookie.split("=")[1] : null;
}

export function setToken(token: string) {
  document.cookie = `token=${token}; path=/`;
}

export function removeToken() {
  document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;";
}

export const isAuthenticated = () => {
  const token = getToken();
  return !!token;
};

export async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
) {
  const token = getToken();
  const headers = {
    ...options.headers,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers,
  });

  if (response.status === 401) {
    removeToken();
    window.location.href = "/auth";
  }

  return response;
}
