"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ConnectSlackPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to backend OAuth flow with HTTPS
    window.location.href = "https://localhost:8000/connect-slack";
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
    </div>
  );
}
