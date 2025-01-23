"use client";

import { useQuery } from "@tanstack/react-query";
import { authenticatedFetch, removeToken } from "../utils/auth";
import { useRouter } from "next/navigation";

export default function Dashboard() {
  const router = useRouter();

  const { data: user, isLoading } = useQuery({
    queryKey: ["user"],
    queryFn: async () => {
      const response = await authenticatedFetch(
        "https://localhost:8000/users/me"
      );
      if (!response.ok) throw new Error("Failed to fetch user");
      return response.json();
    },
  });

  const handleLogout = () => {
    removeToken();
    router.push("/auth");
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Logout
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Profile Information</h2>
              <p className="text-gray-600">Email: {user?.email}</p>
            </div>

            <div>
              <h2 className="text-lg font-semibold">Slack Connection</h2>
              {user?.slack_user_id ? (
                <div className="flex items-center text-green-600">
                  <svg
                    className="w-5 h-5 mr-2"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Connected to Slack
                </div>
              ) : (
                <button
                  onClick={() =>
                    (window.location.href =
                      "https://0.0.0.0:8000/slack/install")
                  }
                  className="flex items-center px-4 py-2 bg-[#4A154B] text-white rounded hover:bg-[#3e1240]"
                >
                  <svg
                    className="w-5 h-5 mr-2"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M6 15a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0-6a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm6 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm6 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm-6 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm6 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" />
                  </svg>
                  Connect with Slack
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
