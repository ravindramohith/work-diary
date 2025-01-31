"use client";

import { useQuery, useMutation, UseQueryOptions } from "@tanstack/react-query";
import { authenticatedRequest, checkAuth, getToken } from "@/utils/auth";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { User2, Lock, Slack, Github, Calendar, X } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";

interface User {
  id: number;
  email: string;
  name: string | null;
  slack_user_id: string | null;
  slack_team_id: string | null;
  google_calendar_connected: boolean;
  github_user_id: string | null;
  github_username: string | null;
}

interface NameFormData {
  name: string;
}

interface PasswordFormData {
  password: string;
  confirmPassword: string;
}

interface DisconnectResponse {
  status: string;
  message: string;
}

export default function EditProfile() {
  const router = useRouter();
  const { toast } = useToast();
  const [nameForm, setNameForm] = useState<NameFormData>({
    name: "",
  });
  const [passwordForm, setPasswordForm] = useState<PasswordFormData>({
    password: "",
    confirmPassword: "",
  });

  // Fetch current user data
  const queryOptions: UseQueryOptions<User, Error> = {
    queryKey: ["user"],
    queryFn: checkAuth as () => Promise<User>,
  };

  const { data: user, isLoading } = useQuery<User, Error>(queryOptions);

  // Update form data when user data is loaded
  useEffect(() => {
    if (user) {
      setNameForm({
        name: user.name || "",
      });
    }
  }, [user]);

  // Update name mutation
  const updateNameMutation = useMutation({
    mutationFn: async (data: NameFormData) => {
      const response = await axios.put(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/users/me`,
        { name: data.name },
        {
          headers: {
            Authorization: `Bearer ${getToken()}`,
          },
        }
      );
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Name updated successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["user"] });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update name",
      });
    },
  });

  // Update password mutation
  const updatePasswordMutation = useMutation({
    mutationFn: async (data: PasswordFormData) => {
      const response = await axios.put(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/users/me`,
        { password: data.password },
        {
          headers: {
            Authorization: `Bearer ${getToken()}`,
          },
        }
      );
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Password updated successfully!",
      });
      setPasswordForm({ password: "", confirmPassword: "" });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update password",
      });
    },
  });

  const queryClient = useQueryClient();

  const disconnectService = async (service: string) => {
    try {
      const { data } = await authenticatedRequest(`/disconnect-${service}`, {
        method: "POST",
      });

      if (data.status === "success") {
        toast({
          title: "Success",
          description: `${
            service.charAt(0).toUpperCase() + service.slice(1)
          } disconnected successfully`,
        });
        await queryClient.invalidateQueries({ queryKey: ["user"] });
      } else {
        throw new Error(data.message || `Failed to disconnect ${service}`);
      }
    } catch (error) {
      console.error(`Error disconnecting ${service}:`, error);
      toast({
        variant: "destructive",
        title: "Error",
        description: `Failed to disconnect ${service}. Please try again.`,
      });
    }
  };

  const [openDialog, setOpenDialog] = useState<{
    type: "name" | "password" | "disconnect";
    service?: string;
  } | null>(null);

  const handleNameUpdate = () => {
    updateNameMutation.mutate(nameForm);
    setOpenDialog(null);
  };

  const handlePasswordUpdate = () => {
    if (passwordForm.password !== passwordForm.confirmPassword) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Passwords do not match!",
      });
      return;
    }
    if (passwordForm.password.length < 6) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Password must be at least 6 characters long!",
      });
      return;
    }
    updatePasswordMutation.mutate(passwordForm);
    setOpenDialog(null);
  };

  const handleDisconnectService = (service: string) => {
    disconnectService(service);
    setOpenDialog(null);
  };

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setOpenDialog({ type: "name" });
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setOpenDialog({ type: "password" });
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNameForm((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPasswordForm((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  if (isLoading || !user) return <div>Loading...</div>;

  const isNameChanged = nameForm.name !== user.name;
  const isPasswordValid =
    passwordForm.password.length >= 6 &&
    passwordForm.password === passwordForm.confirmPassword;

  return (
    <>
      <Dialog
        open={openDialog?.type === "name"}
        onOpenChange={(open) => !open && setOpenDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Name</DialogTitle>
            <DialogDescription>
              Are you sure you want to update your name to "{nameForm.name}"?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleNameUpdate}
              disabled={updateNameMutation.isPending}
            >
              {updateNameMutation.isPending ? "Updating..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={openDialog?.type === "password"}
        onOpenChange={(open) => !open && setOpenDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Password</DialogTitle>
            <DialogDescription>
              Are you sure you want to update your password? This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={handlePasswordUpdate}
              disabled={updatePasswordMutation.isPending}
            >
              {updatePasswordMutation.isPending ? "Updating..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={openDialog?.type === "disconnect"}
        onOpenChange={(open) => !open && setOpenDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect Service</DialogTitle>
            <DialogDescription>
              Are you sure you want to disconnect {openDialog?.service}? You'll
              need to reconnect to use this service again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                openDialog?.service &&
                handleDisconnectService(openDialog.service)
              }
            >
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="min-h-screen">
        <Navbar user={user} currentPage="profile" />
        <div className="container max-w-2xl py-8">
          <div className="max-w-2xl mx-auto space-y-8">
            <Card>
              <CardHeader>
                <CardTitle>Edit Profile</CardTitle>
                <CardDescription>
                  Update your profile information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="email" className="flex items-center gap-2">
                    <User2 className="h-4 w-4" />
                    Email
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    value={user.email}
                    disabled
                    className="bg-muted"
                  />
                </div>

                <Separator />

                <form onSubmit={handleNameSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="flex items-center gap-2">
                      <User2 className="h-4 w-4" />
                      Name
                    </Label>
                    <Input
                      id="name"
                      name="name"
                      value={nameForm.name}
                      onChange={handleNameChange}
                      placeholder={user.name || "Enter your name"}
                    />
                  </div>

                  <div className="flex gap-4">
                    <Button
                      type="submit"
                      disabled={!isNameChanged || updateNameMutation.isPending}
                      className="w-full"
                    >
                      {updateNameMutation.isPending
                        ? "Updating Name..."
                        : "Update Name"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setNameForm({ name: user.name || "" });
                      }}
                      className="w-full"
                    >
                      Cancel
                    </Button>
                  </div>
                </form>

                <Separator />

                <form onSubmit={handlePasswordSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="password"
                      className="flex items-center gap-2"
                    >
                      <Lock className="h-4 w-4" />
                      New Password
                    </Label>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      value={passwordForm.password}
                      onChange={handlePasswordChange}
                      placeholder="Enter new password"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="confirmPassword"
                      className="flex items-center gap-2"
                    >
                      <Lock className="h-4 w-4" />
                      Confirm New Password
                    </Label>
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      value={passwordForm.confirmPassword}
                      onChange={handlePasswordChange}
                      placeholder="Confirm new password"
                    />
                  </div>

                  <div className="flex gap-4">
                    <Button
                      type="submit"
                      disabled={
                        !passwordForm.password ||
                        !isPasswordValid ||
                        updatePasswordMutation.isPending
                      }
                      className="w-full"
                    >
                      {updatePasswordMutation.isPending
                        ? "Updating Password..."
                        : "Update Password"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setPasswordForm({ password: "", confirmPassword: "" });
                      }}
                      className="w-full"
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Connected Services</CardTitle>
                <CardDescription>
                  Manage your connected services
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Slack className="h-5 w-5" />
                    <div>
                      <p className="font-medium">Slack</p>
                      <p className="text-sm text-muted-foreground">
                        {user.slack_user_id ? "Connected" : "Not connected"}
                      </p>
                    </div>
                  </div>
                  {user.slack_user_id ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setOpenDialog({ type: "disconnect", service: "slack" })
                      }
                      className="text-destructive"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        (window.location.href = `${process.env.NEXT_PUBLIC_BACKEND_URL}/connect-slack`)
                      }
                    >
                      Connect
                    </Button>
                  )}
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5" />
                    <div>
                      <p className="font-medium">Google Calendar</p>
                      <p className="text-sm text-muted-foreground">
                        {user.google_calendar_connected
                          ? "Connected"
                          : "Not connected"}
                      </p>
                    </div>
                  </div>
                  {user.google_calendar_connected ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setOpenDialog({ type: "disconnect", service: "google" })
                      }
                      className="text-destructive"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        (window.location.href = `${process.env.NEXT_PUBLIC_BACKEND_URL}/connect-google`)
                      }
                    >
                      Connect
                    </Button>
                  )}
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Github className="h-5 w-5" />
                    <div>
                      <p className="font-medium">GitHub</p>
                      <p className="text-sm text-muted-foreground">
                        {user.github_username
                          ? `Connected as @${user.github_username}`
                          : "Not connected"}
                      </p>
                    </div>
                  </div>
                  {user.github_user_id ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setOpenDialog({ type: "disconnect", service: "github" })
                      }
                      className="text-destructive"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        window.location.href = `${
                          process.env.NEXT_PUBLIC_BACKEND_URL
                        }/connect-github?user_email=${encodeURIComponent(
                          user.email
                        )}`;
                      }}
                    >
                      Connect
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
