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
import { Sheet, SheetTrigger, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/components/ui/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Menu,
  User2,
  Calendar,
  Github,
  CheckCircle2,
  GalleryVerticalEnd,
  Slack,
  ChevronDown,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Navbar } from "@/components/navbar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ActivityData {
  messagesByDay: {
    date: string;
    count: number;
  }[];
  workHoursVsAfterHours: {
    name: string;
    messages: number;
  }[];
  channelDistribution: {
    name: string;
    value: number;
  }[];
  responseTimesByHour: {
    hour: number;
    avgResponseTime: number;
  }[];
  weekdayVsWeekend: {
    name: string;
    messages: number;
  }[];
  dailyActiveHours: {
    date: string;
    hours: number;
  }[];
}

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8"];

export default function Dashboard() {
  const router = useRouter();
  const { toast } = useToast();

  const { data: user, isLoading } = useQuery({
    queryKey: ["user"],
    queryFn: checkAuth,
  });

  const [analysisStatus, setAnalysisStatus] = useState("Send me a nudge");
  const [daysToAnalyze, setDaysToAnalyze] = useState(7);

  const { data: activityData, isLoading: activityLoading } =
    useQuery<ActivityData>({
      queryKey: ["activity", daysToAnalyze],
      queryFn: async () => {
        const response = await authenticatedRequest(
          `/slack/activity?days=${daysToAnalyze}`
        );
        return response.data;
      },
      enabled: !!user?.slack_user_id,
    });

  const handleSendNudge = async () => {
    try {
      // Check if Slack is connected
      if (!user?.slack_user_id) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Please connect your Slack account to receive nudges!",
        });
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
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to analyze Slack activity",
        });
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
          toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to analyze Calendar activity",
          });
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
          toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to analyze GitHub activity",
          });
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
      toast({
        title: "Success",
        description: "Nudge sent successfully! Check your Slack.",
      });
      setTimeout(() => setAnalysisStatus("Send me a nudge"), 3000);
      return nudgeResponse.data;
    } catch (error) {
      console.error("Error sending nudge:", error);
      setAnalysisStatus("Failed to send nudge");
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to send nudge. Please try again.",
      });
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

  if (!user?.slack_user_id) {
    return (
      <div className="min-h-screen">
        <Navbar user={user} currentPage="dashboard" />
        <div className="p-8">
          <div className="max-w-4xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle>Connect Slack to View Analytics</CardTitle>
                <CardDescription>
                  Please connect your Slack account to view your activity
                  analytics.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() =>
                    (window.location.href = `${process.env.NEXT_PUBLIC_BACKEND_URL}/connect-slack`)
                  }
                >
                  Connect Slack
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar user={user} currentPage="dashboard" />
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    {daysToAnalyze} Days{" "}
                    <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>Time Range</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => setDaysToAnalyze(7)}>
                    Last 7 Days
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setDaysToAnalyze(14)}>
                    Last 14 Days
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setDaysToAnalyze(30)}>
                    Last 30 Days
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                onClick={() => sendNudgeMutation.mutate()}
                disabled={sendNudgeMutation.isPending}
                className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
              >
                {sendNudgeMutation.isPending ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    {analysisStatus}
                  </div>
                ) : (
                  <>
                    <Slack className="mr-2 h-4 w-4" />
                    {analysisStatus}
                  </>
                )}
              </Button>
            </div>
          </div>

          {activityLoading ? (
            <div>Loading activity data...</div>
          ) : (
            <Tabs defaultValue="messages" className="space-y-4">
              <TabsList>
                <TabsTrigger value="messages">Message Activity</TabsTrigger>
                <TabsTrigger value="responses">Response Patterns</TabsTrigger>
                <TabsTrigger value="workHours">Work Hours</TabsTrigger>
              </TabsList>

              <TabsContent value="messages" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <Card>
                    <CardHeader>
                      <CardTitle>Daily Messages</CardTitle>
                      <CardDescription>Message count over time</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={activityData?.messagesByDay}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" />
                          <YAxis />
                          <Tooltip />
                          <Line
                            type="monotone"
                            dataKey="count"
                            stroke="#8884d8"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Work Hours vs After Hours</CardTitle>
                      <CardDescription>
                        Message distribution by time
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={activityData?.workHoursVsAfterHours}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="messages" fill="#8884d8" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Channel Distribution</CardTitle>
                      <CardDescription>Messages by channel</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={activityData?.channelDistribution}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                            label
                          >
                            {activityData?.channelDistribution.map(
                              (entry, index) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={COLORS[index % COLORS.length]}
                                />
                              )
                            )}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="responses" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Response Times by Hour</CardTitle>
                      <CardDescription>
                        Average response time throughout the day
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={activityData?.responseTimesByHour}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="hour" />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="avgResponseTime" fill="#00C49F" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Weekday vs Weekend Activity</CardTitle>
                      <CardDescription>
                        Message patterns throughout the week
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={activityData?.weekdayVsWeekend}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="messages" fill="#FFBB28" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="workHours" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Daily Active Hours</CardTitle>
                    <CardDescription>
                      Number of active hours per day
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={activityData?.dailyActiveHours}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Line
                          type="monotone"
                          dataKey="hours"
                          stroke="#FF8042"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}

function MenuIcon() {
  return <Menu className="h-6 w-6" />;
}

function GalleryVerticalEndIcon() {
  return <GalleryVerticalEnd className="h-6 w-6" />;
}
