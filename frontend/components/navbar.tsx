"use client";

import { useRouter } from "next/navigation";
import { removeToken } from "@/utils/auth";
import { Sheet, SheetTrigger, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Menu,
  LogOut,
  User2,
  Calendar,
  Github,
  NotebookPen,
  Slack,
} from "lucide-react";

interface NavbarProps {
  user: any;
  currentPage?: string;
}

export function Navbar({ user, currentPage = "dashboard" }: NavbarProps) {
  const router = useRouter();

  const handleLogout = () => {
    removeToken();
    router.push("/auth");
  };

  return (
    <header className="sticky top-0 z-50 flex h-16 w-full shrink-0 items-center border-b bg-background px-4 md:px-6">
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" className="lg:hidden">
            <Menu className="h-6 w-6" />
            <span className="sr-only">Toggle navigation menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left">
          <div className="flex items-center gap-2 mb-6">
            <NotebookPen className="h-6 w-6" />
            <span className="font-semibold text-lg">Work Diary</span>
          </div>
          <div className="grid gap-2 py-6">
            <span className="flex w-full items-center py-2 text-lg font-semibold">
              {currentPage.charAt(0).toUpperCase() + currentPage.slice(1)}
            </span>
            <button
              onClick={handleLogout}
              className="flex w-full items-center py-2 text-lg font-semibold text-red-600"
            >
              Logout
            </button>
          </div>
        </SheetContent>
      </Sheet>
      <div className="flex items-center gap-2 mr-6">
        <NotebookPen className="h-6 w-6" />
        <span className="font-semibold text-lg hidden md:inline">
          Work Diary
        </span>
      </div>
      <nav className="ml-auto flex gap-4 sm:gap-6 items-center">
        <Button
          variant={currentPage === "dashboard" ? "default" : "ghost"}
          onClick={() => router.push("/dashboard")}
          className="hidden md:inline-flex"
        >
          Dashboard
        </Button>
        <Button
          variant={currentPage === "profile" ? "default" : "ghost"}
          onClick={() => router.push("/profile/edit")}
          className="hidden md:inline-flex"
        >
          Profile
        </Button>
        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="relative flex items-center gap-2 px-2 hover:bg-accent"
            >
              <span className="flex items-center gap-2">
                <Avatar className="h-9 w-9 border-2 border-primary/10 bg-primary/5">
                  <AvatarFallback>
                    {user?.name
                      ? user.name
                          .split(" ")
                          .map((word: string) => word[0])
                          .join("")
                          .toUpperCase()
                      : user?.email?.charAt(0).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden font-medium md:inline-block">
                  {user?.name || user?.email?.split("@")[0]}
                </span>
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-72" align="end" forceMount>
            <DropdownMenuItem
              onClick={() => router.push("/profile/edit")}
              className="flex items-center justify-start gap-2 p-3 pb-2 cursor-pointer"
            >
              <Avatar className="h-9 w-9">
                <AvatarFallback>
                  {user?.name
                    ? user.name
                        .split(" ")
                        .map((word: string) => word[0])
                        .join("")
                        .toUpperCase()
                    : user?.email?.charAt(0).toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col space-y-1 leading-none">
                {user?.name && (
                  <p className="font-medium text-sm">{user.name}</p>
                )}
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
            </DropdownMenuItem>
            {!user?.slack_user_id && (
              <DropdownMenuItem
                onClick={() =>
                  (window.location.href = `${process.env.NEXT_PUBLIC_BACKEND_URL}/connect-slack`)
                }
                className="p-3 focus:bg-accent cursor-pointer flex items-center"
              >
                <Slack className="mr-3 h-4 w-4" />
                <div className="flex flex-col">
                  <span className="font-medium">Connect Slack</span>
                  <span className="text-xs text-muted-foreground">
                    Analyze your Slack activity
                  </span>
                </div>
              </DropdownMenuItem>
            )}
            {!user?.google_calendar_connected && (
              <DropdownMenuItem
                onClick={() =>
                  (window.location.href = `${process.env.NEXT_PUBLIC_BACKEND_URL}/connect-google`)
                }
                className="p-3 focus:bg-accent cursor-pointer flex items-center"
              >
                <Calendar className="mr-3 h-4 w-4" />
                <div className="flex flex-col">
                  <span className="font-medium">Connect Calendar</span>
                  <span className="text-xs text-muted-foreground">
                    Track your meeting patterns
                  </span>
                </div>
              </DropdownMenuItem>
            )}
            {!user?.github_user_id && (
              <DropdownMenuItem
                onClick={() => {
                  if (user?.email) {
                    window.location.href = `${
                      process.env.NEXT_PUBLIC_BACKEND_URL
                    }/connect-github?user_email=${encodeURIComponent(
                      user.email
                    )}`;
                  }
                }}
                className="p-3 focus:bg-accent cursor-pointer flex items-center"
              >
                <Github className="mr-3 h-4 w-4" />
                <div className="flex flex-col">
                  <span className="font-medium">Connect GitHub</span>
                  <span className="text-xs text-muted-foreground">
                    Monitor your coding activity
                  </span>
                </div>
              </DropdownMenuItem>
            )}
            {(user?.slack_user_id ||
              user?.google_calendar_connected ||
              user?.github_user_id) && (
              <>
                <DropdownMenuSeparator />
                {user?.slack_user_id && (
                  <DropdownMenuItem className="p-3 focus:bg-accent/50 cursor-default flex items-center">
                    <Slack className="mr-3 h-4 w-4" />
                    <div className="flex flex-col">
                      <span className="font-medium text-green-600 dark:text-green-400">
                        Slack Connected
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Analyzing your activity
                      </span>
                    </div>
                  </DropdownMenuItem>
                )}
                {user?.google_calendar_connected && (
                  <DropdownMenuItem className="p-3 focus:bg-accent/50 cursor-default flex items-center">
                    <Calendar className="mr-3 h-4 w-4" />
                    <div className="flex flex-col">
                      <span className="font-medium text-green-600 dark:text-green-400">
                        Calendar Connected
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Tracking your meetings
                      </span>
                    </div>
                  </DropdownMenuItem>
                )}
                {user?.github_user_id && (
                  <DropdownMenuItem className="p-3 focus:bg-accent/50 cursor-default flex items-center">
                    <Github className="mr-3 h-4 w-4" />
                    <div className="flex flex-col">
                      <span className="font-medium text-green-600 dark:text-green-400">
                        GitHub Connected
                      </span>
                      <span className="text-xs text-muted-foreground">
                        @{user.github_username}
                      </span>
                    </div>
                  </DropdownMenuItem>
                )}
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="p-3 focus:bg-accent cursor-pointer flex items-center text-red-600 dark:text-red-500 focus:text-red-600"
              onClick={handleLogout}
            >
              <LogOut className="mr-3 h-4 w-4" />
              <div className="flex flex-col">
                <span className="font-medium">Logout</span>
                <span className="text-xs text-muted-foreground">
                  Sign out of your account
                </span>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
    </header>
  );
}
