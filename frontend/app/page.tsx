"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getToken, authenticatedFetch } from "./utils/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function Home() {
  const router = useRouter();

  // Check authentication status
  const { data: user, isLoading } = useQuery({
    queryKey: ["user"],
    queryFn: async () => {
      const token = getToken();
      if (!token) {
        router.push("/auth");
        return null;
      }
      const response = await authenticatedFetch(
        "https://localhost:8000/users/me"
      );
      if (!response.ok) {
        router.push("/auth");
        return null;
      }
      return response.json();
    },
  });

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/auth");
    } else if (!isLoading && user) {
      // If user is authenticated but hasn't connected Slack, send to connect page
      if (!user.slack_user_id) {
        router.push("/connect-slack");
      } else {
        // If user is authenticated and has Slack connected, send to dashboard
        router.push("/dashboard");
      }
    }
  }, [user, isLoading, router]);

  const handleGitHubConnect = () => {
    window.location.href = "https://localhost:8000/connect-github";
  };

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  // This will only show briefly before redirect
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold text-center mb-8">Balance IQ</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
          <Card className="p-6">
            <h2 className="text-2xl font-semibold mb-4">
              Connect Your Services
            </h2>
            <div className="space-y-4">
              <Button
                onClick={() =>
                  (window.location.href =
                    "https://localhost:8000/connect-slack")
                }
                className="w-full bg-[#4A154B] hover:bg-[#611f64]"
              >
                Connect Slack
              </Button>

              <Button
                onClick={() =>
                  (window.location.href =
                    "https://localhost:8000/connect-google")
                }
                className="w-full bg-[#4285F4] hover:bg-[#357ABD]"
              >
                Connect Google Calendar
              </Button>

              <Button
                onClick={handleGitHubConnect}
                className="w-full bg-[#24292e] hover:bg-[#3a3f44]"
              >
                Connect GitHub
              </Button>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-2xl font-semibold mb-4">About Balance IQ</h2>
            <p className="text-gray-600 dark:text-gray-300">
              Balance IQ helps you maintain a healthy work-life balance by
              analyzing your:
            </p>
            <ul className="list-disc list-inside mt-4 space-y-2 text-gray-600 dark:text-gray-300">
              <li>Slack communication patterns</li>
              <li>Google Calendar meeting load</li>
              <li>GitHub coding activity</li>
              <li>Work hours and intensity</li>
            </ul>
          </Card>
        </div>
      </div>
    </main>
  );
}
