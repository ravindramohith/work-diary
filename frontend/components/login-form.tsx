"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";
import { setToken } from "@/utils/auth";

interface LoginFormData {
  email: string;
  password: string;
  name?: string;
}

const BASE_URL = `${process.env.NEXT_PUBLIC_BACKEND_URL}`;

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"form">) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSignup, setIsSignup] = useState(false);
  const [formData, setFormData] = useState<LoginFormData>({
    email: "",
    password: "",
    name: "",
  });

  const handleAuthSuccess = (data: any) => {
    setToken(data.access_token);
    toast({
      title: "Success!",
      description: isSignup ? "Account created successfully!" : "Welcome back!",
      duration: 3000,
    });

    if (data.user?.slack_user_id) {
      router.push("/dashboard");
    } else {
      router.push("/connect-slack");
    }
  };

  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      const formData = new URLSearchParams();
      formData.append("username", data.email);
      formData.append("password", data.password);

      const response = await axios.post(`${BASE_URL}/login`, formData, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        withCredentials: true,
      });
      return response.data;
    },
    onSuccess: handleAuthSuccess,
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Login failed",
        variant: "destructive",
      });
    },
  });

  const signupMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      const response = await axios.post(`${BASE_URL}/signup`, data, {
        withCredentials: true,
      });
      return response.data;
    },
    onSuccess: (data) => {
      loginMutation.mutate(formData);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Signup failed",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSignup) {
      signupMutation.mutate({
        email: formData.email,
        password: formData.password,
        name: formData.name,
      });
    } else {
      loginMutation.mutate(formData);
    }
  };

  const toggleMode = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsSignup(!isSignup);
  };

  return (
    <form
      className={cn("flex flex-col gap-6", className)}
      {...props}
      onSubmit={handleSubmit}
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">
          {isSignup ? "Create an account" : "Login to your account"}
        </h1>
        <p className="text-balance text-sm text-muted-foreground">
          {isSignup
            ? "Enter your details below to create your account"
            : "Enter your email below to login to your account"}
        </p>
      </div>
      <div className="grid gap-6">
        {isSignup && (
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              type="text"
              placeholder="John Doe"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              className="appearance-none"
            />
          </div>
        )}
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="m@example.com"
            required
            value={formData.email}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, email: e.target.value }))
            }
            className="appearance-none"
          />
        </div>
        <div className="grid gap-2">
          <div className="flex items-center">
            <Label htmlFor="password">Password</Label>
            {!isSignup && (
              <a
                href="#"
                className="ml-auto text-sm underline-offset-4 hover:underline"
              >
                Forgot your password?
              </a>
            )}
          </div>
          <Input
            id="password"
            type="password"
            required
            value={formData.password}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, password: e.target.value }))
            }
            className="appearance-none"
          />
        </div>
        <Button
          type="submit"
          className="w-full"
          disabled={loginMutation.isPending || signupMutation.isPending}
        >
          {loginMutation.isPending || signupMutation.isPending ? (
            <span>Please wait...</span>
          ) : isSignup ? (
            "Sign up"
          ) : (
            "Login"
          )}
        </Button>
      </div>
      <div className="text-center text-sm">
        {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
        <Button
          variant="link"
          className="underline underline-offset-4 h-auto p-0"
          onClick={toggleMode}
          disabled={loginMutation.isPending || signupMutation.isPending}
        >
          {isSignup ? "Login" : "Sign up"}
        </Button>
      </div>
    </form>
  );
}
