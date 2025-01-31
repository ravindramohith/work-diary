"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import {
  authenticatedRequest,
  removeToken,
  checkAuth,
  getToken,
} from "../../utils/auth";
import { useRouter } from "next/navigation";
import { useState } from "react";
import axios from "axios";
import { toast } from "react-hot-toast";

export default function Dashboard() {
  const router = useRouter();

  const { data: user, isLoading } = useQuery({
    queryKey: ["user"],
    queryFn: checkAuth,
  });

  const [analysisStatus, setAnalysisStatus] = useState("Send me a nudge");
  const [daysToAnalyze, setDaysToAnalyze] = useState(7);

  const handleSendNudge = async () => {
    try {
      // Check if Slack is connected
      if (!user?.slack_user_id) {
        toast.error("Please connect your Slack account to receive nudges!");
        return;
      }

      const token = getToken();
      let slackResponse, calendarResponse, githubResponse;

      // Always analyze Slack as it's required
      setAnalysisStatus("Analyzing Slack...");
      try {
        slackResponse = await axios.post(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/slack/analyze`,
          { days: daysToAnalyze },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );
      } catch (error) {
        toast.error("Failed to analyze Slack activity");
        setAnalysisStatus("Send me a nudge");
        return;
      }

      // Only analyze Calendar if connected
      if (user?.google_calendar_connected) {
        setAnalysisStatus("Analyzing Calendar...");
        try {
          calendarResponse = await axios.post(
            `${process.env.NEXT_PUBLIC_BACKEND_URL}/calendar/analyze`,
            { days: daysToAnalyze },
            {
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
            }
          );
        } catch (error) {
          console.error("Calendar analysis failed:", error);
          toast.error("Failed to analyze Calendar activity");
        }
      }

      // Only analyze GitHub if connected
      if (user?.github_user_id) {
        setAnalysisStatus("Analyzing GitHub...");
        try {
          githubResponse = await axios.post(
            `${process.env.NEXT_PUBLIC_BACKEND_URL}/github/analyze`,
            { days: daysToAnalyze },
            {
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
            }
          );
        } catch (error) {
          console.error("GitHub analysis failed:", error);
          toast.error("Failed to analyze GitHub activity");
        }
      }

      setAnalysisStatus("Hold up, almost done...");
      const nudgeResponse = await axios.post(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/slack/send-combined-nudge`,
        {
          slack_analysis: slackResponse?.data,
          calendar_analysis: calendarResponse?.data,
          github_analysis: githubResponse?.data,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      setAnalysisStatus("Sent successfully!");
      toast.success("Nudge sent successfully! Check your Slack.");
      setTimeout(() => setAnalysisStatus("Send me a nudge"), 3000);
      return nudgeResponse.data;
    } catch (error) {
      console.error("Error sending nudge:", error);
      setAnalysisStatus("Failed to send nudge");
      toast.error("Failed to send nudge. Please try again.");
      setTimeout(() => setAnalysisStatus("Send me a nudge"), 3000);
      throw error;
    }
  };

  const sendNudgeMutation = useMutation({
    mutationFn: handleSendNudge,
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
                    (window.location.href = `${process.env.NEXT_PUBLIC_BACKEND_URL}/connect-slack`)
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
                    (window.location.href = `${process.env.NEXT_PUBLIC_BACKEND_URL}/connect-google`)
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
                      window.location.href = `${
                        process.env.NEXT_PUBLIC_BACKEND_URL
                      }/connect-github?user_email=${encodeURIComponent(
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
                <div className="mt-4 flex items-center gap-4">
                  <select
                    value={daysToAnalyze}
                    onChange={(e) => setDaysToAnalyze(Number(e.target.value))}
                    className="block rounded-md border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:ring-indigo-500"
                  >
                    <option value={7}>Last 7 days</option>
                    <option value={14}>Last 14 days</option>
                    <option value={30}>Last 30 days</option>
                    <option value={60}>Last 60 days</option>
                    <option value={90}>Last 90 days</option>
                  </select>
                  <button
                    onClick={() => sendNudgeMutation.mutate()}
                    disabled={sendNudgeMutation.isPending}
                    className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-indigo-400"
                  >
                    {analysisStatus}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
