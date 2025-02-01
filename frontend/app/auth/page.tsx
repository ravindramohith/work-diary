"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setToken } from "@/utils/auth";
import { useToast } from "@/components/ui/use-toast";
import axios from "axios";
import { NotebookPen } from "lucide-react";
import Image from "next/image";
import { LoginForm } from "@/components/login-form";

export default function Auth() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    name: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const endpoint = isSignUp ? "signup" : "login";
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/${endpoint}`,
        isSignUp
          ? formData
          : {
              username: formData.email,
              password: formData.password,
            },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data) {
        if (isSignUp) {
          toast({
            title: "Success",
            description: "Account created successfully! Please log in.",
          });
          setIsSignUp(false);
        } else {
          setToken(response.data.access_token);
          toast({
            title: "Success",
            description: "Logged in successfully!",
          });
          router.push("/dashboard");
        }
      }
    } catch (error: any) {
      console.error("Auth error:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description:
          error.response?.data?.detail ||
          (isSignUp
            ? "Failed to create account. Please try again."
            : "Invalid email or password."),
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <a href="#" className="flex items-center gap-2 font-medium">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <NotebookPen className="size-4" />
            </div>
            Work Diary
          </a>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <LoginForm />
          </div>
        </div>
      </div>
      <div className="relative hidden bg-muted lg:block">
        <Image
          src="/work_diary.jpg"
          alt="Work Diary Illustration"
          fill
          className="object-cover dark:brightness-[0.2] dark:grayscale"
          priority
        />
      </div>
    </div>
  );
}
