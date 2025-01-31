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

            {/* Google Calendar Connection */}
            <div className="mt-6">
              <h2 className="text-lg font-semibold">
                Google Calendar Connection
              </h2>
              {user?.google_calendar_connected ? (
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
                    Connected to Google Calendar
                  </div>

                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    <h3 className="text-md font-medium mb-2">
                      Calendar Activity
                    </h3>
                    <div className="space-y-2">
                      <p className="text-sm text-gray-600">
                        Your calendar activity and meeting patterns will be
                        analyzed to help maintain work-life balance.
                      </p>
                      <ul className="list-disc list-inside text-sm text-gray-600">
                        <li>Meeting frequency analysis</li>
                        <li>Back-to-back meeting detection</li>
                        <li>After-hours meeting tracking</li>
                        <li>Meeting duration patterns</li>
                      </ul>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() =>
                    (window.location.href =
                      "https://localhost:8000/connect-google")
                  }
                  className="flex items-center px-4 py-2 bg-[#4285F4] text-white rounded hover:bg-[#3367D6]"
                >
                  <svg
                    className="w-5 h-5 mr-2"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 0C5.383 0 0 5.383 0 12s5.383 12 12 12c2.424 0 4.761-.722 6.76-2.087l.034-.024-1.617-1.879-.027.017A9.494 9.494 0 0 1 12 21.54c-5.26 0-9.54-4.28-9.54-9.54 0-5.26 4.28-9.54 9.54-9.54 2.769 0 5.262 1.2 7.02 3.093l-3.017 3.017H24V.604l-3.028 3.028C18.951 1.651 15.684 0 12 0z" />
                  </svg>
                  Connect Google Calendar
                </button>
              )}
            </div>

            {/* GitHub Connection */}
            <div className="mt-6">
              <h2 className="text-lg font-semibold">GitHub Connection</h2>
              {user?.github_user_id ? (
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
                    Connected to GitHub ({user.github_username})
                  </div>

                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    <h3 className="text-md font-medium mb-2">
                      GitHub Activity
                    </h3>
                    <div className="space-y-2">
                      <p className="text-sm text-gray-600">
                        Your GitHub activity will be analyzed to help maintain
                        work-life balance.
                      </p>
                      <ul className="list-disc list-inside text-sm text-gray-600">
                        <li>Commit frequency analysis</li>
                        <li>Code review patterns</li>
                        <li>After-hours coding detection</li>
                        <li>Project contribution metrics</li>
                      </ul>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    if (user?.email) {
                      window.location.href = `https://localhost:8000/connect-github?user_email=${encodeURIComponent(
                        user.email
                      )}`;
                    } else {
                      console.error("User email not found");
                    }
                  }}
                  className="flex items-center px-4 py-2 bg-[#24292e] text-white rounded hover:bg-[#3a3f44]"
                >
                  <svg
                    className="w-5 h-5 mr-2"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                  </svg>
                  Connect GitHub
                </button>
              )}
            </div>

            {/* Work-Life Balance Section */}
            <div className="mt-6">
              <h2 className="text-lg font-semibold">Work-Life Balance</h2>
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">
                  We analyze your Slack communication patterns and calendar data
                  to help you maintain a healthy work-life balance.
                </p>
                <button
                  onClick={() => sendNudgeMutation.mutate()}
                  disabled={sendNudgeMutation.isPending}
                  className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-indigo-400"
                >
                  {sendNudgeMutation.status === "pending"
                    ? "Sending..."
                    : "Send me a nudge"}
                </button>
                {sendNudgeMutation.status === "error" && (
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
          </div>
        </div>
      </div>
    </div>
  );
}
