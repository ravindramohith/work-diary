"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getToken, authenticatedFetch } from "./utils/auth";

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

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  // This will only show briefly before redirect
  return null;
}
