"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
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

  const sendNudgeMutation = useMutation({
    mutationFn: async () => {
      const response = await authenticatedFetch(
        "https://localhost:8000/slack/send-nudge",
        {
          method: "POST",
        }
      );
      if (!response.ok) throw new Error("Failed to send nudge");
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

          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">Profile Information</h2>
              <p className="text-gray-600">Email: {user?.email}</p>
            </div>

            <div>
              <h2 className="text-lg font-semibold">Slack Connection</h2>
              {user?.slack_user_id ? (
                <div className="space-y-4">
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

                  <div>
                    <button
                      onClick={() => sendNudgeMutation.mutate()}
                      disabled={sendNudgeMutation.isPending}
                      className="inline-flex items-center px-4 py-2 bg-[#4A154B] text-white rounded hover:bg-[#3e1240] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sendNudgeMutation.isPending ? (
                        <>
                          <svg
                            className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                          Sending...
                        </>
                      ) : (
                        <>
                          <svg
                            className="w-5 h-5 mr-2"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-4l-4 4-4-4z"
                            />
                          </svg>
                          Send Nudge
                        </>
                      )}
                    </button>
                    {sendNudgeMutation.isError && (
                      <p className="mt-2 text-red-600">
                        Failed to send nudge. Please try again.
                      </p>
                    )}
                    {sendNudgeMutation.isSuccess && (
                      <p className="mt-2 text-green-600">
                        Nudge sent successfully!
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <button
                  onClick={() =>
                    (window.location.href =
                      "https://localhost:8000/connect-slack")
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
