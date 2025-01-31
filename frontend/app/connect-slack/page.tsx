"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { checkAuth } from "../../utils/auth";

export default function ConnectSlackPage() {
  const router = useRouter();

  const { data: user, isLoading } = useQuery({
    queryKey: ["user"],
    queryFn: checkAuth,
  });

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.push("/auth");
      } else if (user.slack_user_id) {
        router.push("/dashboard");
      } else {
        window.location.href = `${process.env.NEXT_PUBLIC_BACKEND_URL}/connect-slack`;
      }
    }
  }, [user, isLoading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
    </div>
  );
}
