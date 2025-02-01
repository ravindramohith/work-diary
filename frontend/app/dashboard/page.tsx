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
import { Button } from "@/components/ui/button";
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
  Github,
  CheckCircle2,
  Slack,
  ChevronDown,
  Clock,
  AlertCircle,
  CalendarDays,
  CalendarRange,
  Calendar as CalendarIcon,
  GalleryVerticalEnd,
  Calendar,
} from "lucide-react";
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
import { GitHubActivity } from "@/components/github-activity";
import { GitHubInsights } from "@/components/github-insights";
import { CalendarActivity } from "@/components/calendar-activity";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/loading-spinner";
import { LucideIcon } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AIAnalysis } from "@/components/ai-analysis";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

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

interface GitHubData {
  commit_count: number;
  pr_count: number;
  review_count: number;
  issue_count: number;
  comment_count: number;
  active_repos: string[];
  events_by_day: {
    [key: string]: {
      [key: string]: number;
    };
  };
  language_distribution: {
    name: string;
    value: number;
  }[];
}

interface CalendarData {
  total_meetings: number;
  total_duration_minutes: number;
  meetings_after_hours: number;
  early_meetings: number;
  back_to_back_meetings: number;
  recurring_meetings: number;
  daily_meeting_counts: { [key: string]: number };
  weekly_patterns: { [key: string]: number };
  hourly_distribution: { [key: string]: number };
  meeting_durations: number[];
  meeting_types: {
    one_on_one: number;
    team_meetings: number;
    external_meetings: number;
  };
  average_meeting_duration?: number;
  meetings_per_day?: number;
  median_meeting_duration?: number;
}

interface TimeRangeOption {
  value: number;
  label: string;
  description: string;
  icon: LucideIcon;
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
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    });

  const { data: githubData, isLoading: githubLoading } = useQuery<GitHubData>({
    queryKey: ["github", daysToAnalyze],
    queryFn: async () => {
      const response = await authenticatedRequest(
        `/github/activity?days=${daysToAnalyze}`
      );
      return response.data;
    },
    enabled: !!user?.github_user_id,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: calendarData, isLoading: calendarLoading } =
    useQuery<CalendarData>({
      queryKey: ["calendar", daysToAnalyze],
      queryFn: async () => {
        const response = await authenticatedRequest(
          `/calendar/activity?days=${daysToAnalyze}`
        );
        return response.data;
      },
      enabled: !!user?.google_calendar_connected,
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    });

  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState<string | null>(null);
  const [isAccordionOpen, setIsAccordionOpen] = useState(false);

  const handleSendNudge = async () => {
    setIsAnalyzing(true);
    setIsAccordionOpen(true);
    setAiAnalysis(null);

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

      let slackResponse, githubResponse;
      const token = getToken();

      // Analyze Slack (Required)
      setAnalysisStep("Analyzing Slack activity patterns... 🔍");
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
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Visual delay
      } catch (error) {
        console.error("Slack analysis failed:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to analyze Slack activity",
        });
        throw error;
      }

      // Analyze GitHub if connected
      if (user?.github_user_id) {
        setAnalysisStep("Processing GitHub contributions... 💻");
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
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Visual delay
        } catch (error) {
          console.error("GitHub analysis failed:", error);
          toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to analyze GitHub activity",
          });
        }
      }

      // Use pre-fetched calendar data
      if (user?.google_calendar_connected) {
        setAnalysisStep("Examining calendar patterns... 📅");
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Visual delay for consistency
      }

      // Generate combined analysis
      setAnalysisStep("Generating AI insights... ✨");
      const analyses = {
        slack_analysis: slackResponse?.data,
        calendar_analysis: calendarData,
        github_analysis: githubResponse?.data,
      };

      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/slack/send-combined-nudge`,
        analyses,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      setAiAnalysis(response.data.analysis);
      setAnalysisStep("Analysis complete! 🎉");

      toast({
        title: "Success",
        description: "Nudge sent successfully!",
      });
    } catch (error: any) {
      console.error("Error sending nudge:", error);
      setAnalysisStep("Analysis failed ❌");
      toast({
        variant: "destructive",
        title: "Error",
        description: error.response?.data?.detail || "Failed to send nudge",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const sendNudgeMutation = useMutation({
    mutationFn: handleSendNudge,
  });

  const handleLogout = () => {
    removeToken();
    router.push("/auth");
  };

  const timeRangeOptions: TimeRangeOption[] = [
    {
      value: 7,
      label: "Last 7 Days",
      description: "View activity from the past week",
      icon: CalendarDays,
    },
    {
      value: 14,
      label: "Last 14 Days",
      description: "View activity from the past two weeks",
      icon: CalendarRange,
    },
    {
      value: 30,
      label: "Last 30 Days",
      description: "View activity from the past month",
      icon: CalendarIcon,
    },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner text="Loading your dashboard" />
      </div>
    );
  }

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
      <div className="p-4 sm:p-8">
        <div className="max-w-7xl mx-auto">
          {/* Analysis Controls Section */}
          <div className="w-full mb-8 flex flex-row justify-between items-center flex-wrap">
            <h1
              className="text-3xl font-bold mb-4 bg-gradient-to-b 
    from-black to-neutral-800 dark:from-neutral-100 dark:to-neutral-500 
    text-transparent bg-clip-text"
            >
              {user?.name
                ? `${user.name}'s Dashboard`
                : "Productivity Analytics"}
            </h1>

            <div className="flex flex-col space-y-4 sm:flex-row sm:space-y-0 sm:space-x-4 mb-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full sm:w-[220px]">
                    <Clock className="mr-2 h-4 w-4" />
                    {
                      timeRangeOptions.find(
                        (opt) => opt.value === daysToAnalyze
                      )?.label
                    }
                    <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[220px]">
                  <DropdownMenuLabel className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Time Range
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {timeRangeOptions.map((option) => {
                    const Icon = option.icon;
                    return (
                      <DropdownMenuItem
                        key={option.value}
                        onClick={() => setDaysToAnalyze(option.value)}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <div className="flex items-center gap-2 flex-1">
                          <Icon className="h-4 w-4 text-primary" />
                          <div className="flex flex-col">
                            <span>{option.label}</span>
                            <span className="text-xs text-muted-foreground">
                              {option.description}
                            </span>
                          </div>
                        </div>
                        {daysToAnalyze === option.value && (
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                        )}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                onClick={handleSendNudge}
                disabled={isAnalyzing || !user?.slack_user_id}
                className="w-full sm:w-[180px]"
              >
                {isAnalyzing ? (
                  <motion.span
                    className="flex items-center gap-2"
                    animate={{ opacity: [1, 0.5, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <Sparkles className="h-4 w-4" />
                    Analyzing...
                  </motion.span>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Analyse
                  </>
                )}
              </Button>
            </div>

            {/* Analysis Accordion */}
            <Accordion
              type="single"
              collapsible
              value={isAccordionOpen ? "analysis" : ""}
              className="w-full"
            >
              <AccordionItem value="analysis" className="border-none">
                <AccordionContent>
                  <Card className="w-full">
                    <CardContent className="pt-6">
                      {analysisStep && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex flex-col gap-4"
                        >
                          <div className="flex items-center gap-2">
                            <motion.div
                              animate={{
                                scale: [1, 2, 1],
                                rotate: [0, 360],
                              }}
                              transition={{
                                duration: 2,
                                repeat: isAnalyzing ? Infinity : 0,
                                ease: "easeInOut",
                              }}
                            >
                              <div className="w-2 h-2 rounded-full bg-primary" />
                            </motion.div>
                            <span className="text-sm text-muted-foreground">
                              {analysisStep}
                            </span>
                          </div>

                          {aiAnalysis && !isAnalyzing && (
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: 0.3 }}
                              className="w-full"
                            >
                              <AIAnalysis data={aiAnalysis} isLoading={false} />
                            </motion.div>
                          )}
                        </motion.div>
                      )}
                    </CardContent>
                  </Card>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>

          {/* Rest of the dashboard content */}
          <div className="space-y-8">
            {activityLoading ? (
              <LoadingSpinner text="Analyzing Slack activity" />
            ) : (
              <div>
                <h2 className="text-2xl font-bold mb-4">SLACK ANALYSIS</h2>

                {/* Tabs for large screens */}
                <div className="hidden lg:block">
                  <Tabs defaultValue="messages" className="space-y-4">
                    <TabsList className="grid w-full grid-cols-3 gap-4">
                      <TabsTrigger
                        value="messages"
                        className="whitespace-nowrap"
                      >
                        Message Activity
                      </TabsTrigger>
                      <TabsTrigger
                        value="responses"
                        className="whitespace-nowrap"
                      >
                        Response Patterns
                      </TabsTrigger>
                      <TabsTrigger
                        value="workHours"
                        className="whitespace-nowrap"
                      >
                        Work Hours
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="messages" className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        <Card>
                          <CardHeader>
                            <CardTitle>Daily Messages</CardTitle>
                            <CardDescription>
                              Message count over time
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="h-[300px]">
                            {activityData?.messagesByDay &&
                            activityData.messagesByDay.length > 0 ? (
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={activityData.messagesByDay}>
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
                            ) : (
                              <div className="flex items-center justify-center h-full text-muted-foreground">
                                No message data available
                              </div>
                            )}
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
                            {activityData?.workHoursVsAfterHours &&
                            activityData.workHoursVsAfterHours.length > 0 ? (
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                  data={activityData.workHoursVsAfterHours}
                                >
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis dataKey="name" />
                                  <YAxis />
                                  <Tooltip />
                                  <Bar dataKey="messages" fill="#8884d8" />
                                </BarChart>
                              </ResponsiveContainer>
                            ) : (
                              <div className="flex items-center justify-center h-full text-muted-foreground">
                                No work hours data available
                              </div>
                            )}
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader>
                            <CardTitle>Channel Distribution</CardTitle>
                            <CardDescription>
                              Messages by channel
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="h-[300px]">
                            {activityData?.channelDistribution &&
                            activityData.channelDistribution.length > 0 ? (
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie
                                    data={activityData.channelDistribution}
                                    dataKey="value"
                                    nameKey="name"
                                    cx="50%"
                                    cy="50%"
                                    outerRadius={80}
                                    fill="#8884d8"
                                    label
                                  >
                                    {activityData.channelDistribution.map(
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
                            ) : (
                              <div className="flex items-center justify-center h-full text-muted-foreground">
                                No channel data available
                              </div>
                            )}
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
                            {activityData?.responseTimesByHour &&
                            activityData.responseTimesByHour.length > 0 ? (
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                  data={activityData.responseTimesByHour}
                                >
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis dataKey="hour" />
                                  <YAxis />
                                  <Tooltip />
                                  <Bar
                                    dataKey="avgResponseTime"
                                    fill="#82ca9d"
                                  />
                                </BarChart>
                              </ResponsiveContainer>
                            ) : (
                              <div className="flex items-center justify-center h-full text-muted-foreground">
                                No response time data available
                              </div>
                            )}
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
                            {activityData?.weekdayVsWeekend &&
                            activityData.weekdayVsWeekend.length > 0 ? (
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={activityData.weekdayVsWeekend}>
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis dataKey="name" />
                                  <YAxis />
                                  <Tooltip />
                                  <Bar dataKey="messages" fill="#ffc658" />
                                </BarChart>
                              </ResponsiveContainer>
                            ) : (
                              <div className="flex items-center justify-center h-full text-muted-foreground">
                                No weekday/weekend data available
                              </div>
                            )}
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
                          {activityData?.dailyActiveHours &&
                          activityData.dailyActiveHours.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={activityData.dailyActiveHours}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="date" />
                                <YAxis />
                                <Tooltip />
                                <Line
                                  type="monotone"
                                  dataKey="hours"
                                  stroke="#ff7300"
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          ) : (
                            <div className="flex items-center justify-center h-full text-muted-foreground">
                              No active hours data available
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </TabsContent>
                  </Tabs>
                </div>

                {/* Select menu for medium and smaller screens */}
                <div className="lg:hidden space-y-6">
                  <Select
                    defaultValue="messages"
                    onValueChange={(value: string) => {
                      const sections = document.querySelectorAll(
                        "[data-slack-section]"
                      );
                      sections.forEach((section) => {
                        if (section instanceof HTMLElement) {
                          section.style.display =
                            section.dataset.slackSection === value
                              ? "block"
                              : "none";
                        }
                      });
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select view" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="messages">Message Activity</SelectItem>
                      <SelectItem value="responses">
                        Response Patterns
                      </SelectItem>
                      <SelectItem value="workHours">Work Hours</SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="space-y-8">
                    {/* Message Activity Section */}
                    <div data-slack-section="messages" className="space-y-4">
                      <h3 className="text-lg font-semibold">
                        Message Activity
                      </h3>
                      <div className="grid gap-4">
                        <Card>
                          <CardHeader>
                            <CardTitle>Daily Messages</CardTitle>
                            <CardDescription>
                              Message count over time
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="h-[300px]">
                            {activityData?.messagesByDay &&
                            activityData.messagesByDay.length > 0 ? (
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={activityData.messagesByDay}>
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
                            ) : (
                              <div className="flex items-center justify-center h-full text-muted-foreground">
                                No message data available
                              </div>
                            )}
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
                            {activityData?.workHoursVsAfterHours &&
                            activityData.workHoursVsAfterHours.length > 0 ? (
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                  data={activityData.workHoursVsAfterHours}
                                >
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis dataKey="name" />
                                  <YAxis />
                                  <Tooltip />
                                  <Bar dataKey="messages" fill="#8884d8" />
                                </BarChart>
                              </ResponsiveContainer>
                            ) : (
                              <div className="flex items-center justify-center h-full text-muted-foreground">
                                No work hours data available
                              </div>
                            )}
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader>
                            <CardTitle>Channel Distribution</CardTitle>
                            <CardDescription>
                              Messages by channel
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="h-[300px]">
                            {activityData?.channelDistribution &&
                            activityData.channelDistribution.length > 0 ? (
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie
                                    data={activityData.channelDistribution}
                                    dataKey="value"
                                    nameKey="name"
                                    cx="50%"
                                    cy="50%"
                                    outerRadius={80}
                                    fill="#8884d8"
                                    label
                                  >
                                    {activityData.channelDistribution.map(
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
                            ) : (
                              <div className="flex items-center justify-center h-full text-muted-foreground">
                                No channel data available
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    </div>

                    {/* Response Patterns Section */}
                    <div
                      data-slack-section="responses"
                      className="space-y-4"
                      style={{ display: "none" }}
                    >
                      <h3 className="text-lg font-semibold">
                        Response Patterns
                      </h3>
                      <div className="grid gap-4">
                        <Card>
                          <CardHeader>
                            <CardTitle>Response Times by Hour</CardTitle>
                            <CardDescription>
                              Average response time throughout the day
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="h-[300px]">
                            {activityData?.responseTimesByHour &&
                            activityData.responseTimesByHour.length > 0 ? (
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                  data={activityData.responseTimesByHour}
                                >
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis dataKey="hour" />
                                  <YAxis />
                                  <Tooltip />
                                  <Bar
                                    dataKey="avgResponseTime"
                                    fill="#82ca9d"
                                  />
                                </BarChart>
                              </ResponsiveContainer>
                            ) : (
                              <div className="flex items-center justify-center h-full text-muted-foreground">
                                No response time data available
                              </div>
                            )}
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
                            {activityData?.weekdayVsWeekend &&
                            activityData.weekdayVsWeekend.length > 0 ? (
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={activityData.weekdayVsWeekend}>
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis dataKey="name" />
                                  <YAxis />
                                  <Tooltip />
                                  <Bar dataKey="messages" fill="#ffc658" />
                                </BarChart>
                              </ResponsiveContainer>
                            ) : (
                              <div className="flex items-center justify-center h-full text-muted-foreground">
                                No weekday/weekend data available
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    </div>

                    {/* Work Hours Section */}
                    <div
                      data-slack-section="workHours"
                      className="space-y-4"
                      style={{ display: "none" }}
                    >
                      <h3 className="text-lg font-semibold">Work Hours</h3>
                      <Card>
                        <CardHeader>
                          <CardTitle>Daily Active Hours</CardTitle>
                          <CardDescription>
                            Number of active hours per day
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="h-[400px]">
                          {activityData?.dailyActiveHours &&
                          activityData.dailyActiveHours.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={activityData.dailyActiveHours}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="date" />
                                <YAxis />
                                <Tooltip />
                                <Line
                                  type="monotone"
                                  dataKey="hours"
                                  stroke="#ff7300"
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          ) : (
                            <div className="flex items-center justify-center h-full text-muted-foreground">
                              No active hours data available
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </div>

                {user?.github_user_id && (
                  <div>
                    <h2 className="text-2xl font-bold mb-4">GITHUB ANALYSIS</h2>

                    {/* Tabs for large screens */}
                    <div className="hidden lg:block">
                      <Tabs defaultValue="activity" className="space-y-4">
                        <TabsList className="grid w-full grid-cols-2 gap-4">
                          <TabsTrigger
                            value="activity"
                            className="whitespace-nowrap"
                          >
                            GitHub Activity
                          </TabsTrigger>
                          <TabsTrigger
                            value="insights"
                            className="whitespace-nowrap"
                          >
                            Code Insights
                          </TabsTrigger>
                        </TabsList>

                        <TabsContent value="activity" className="space-y-4">
                          <GitHubActivity
                            data={githubData}
                            isLoading={githubLoading}
                            user={user}
                          />
                        </TabsContent>

                        <TabsContent value="insights" className="space-y-4">
                          <GitHubInsights
                            data={githubData}
                            isLoading={githubLoading}
                          />
                        </TabsContent>
                      </Tabs>
                    </div>

                    {/* Select menu for medium and smaller screens */}
                    <div className="lg:hidden space-y-6">
                      <Select
                        defaultValue="activity"
                        onValueChange={(value: string) => {
                          const sections = document.querySelectorAll(
                            "[data-github-section]"
                          );
                          sections.forEach((section) => {
                            if (section instanceof HTMLElement) {
                              section.style.display =
                                section.dataset.githubSection === value
                                  ? "block"
                                  : "none";
                            }
                          });
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select view" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="activity">
                            GitHub Activity
                          </SelectItem>
                          <SelectItem value="insights">
                            Code Insights
                          </SelectItem>
                        </SelectContent>
                      </Select>

                      <div className="space-y-8">
                        {/* GitHub Activity Section */}
                        <div
                          data-github-section="activity"
                          className="space-y-4"
                        >
                          <h3 className="text-lg font-semibold">
                            GitHub Activity
                          </h3>
                          <GitHubActivity
                            data={githubData}
                            isLoading={githubLoading}
                            user={user}
                          />
                        </div>

                        {/* Code Insights Section */}
                        <div
                          data-github-section="insights"
                          className="space-y-4"
                          style={{ display: "none" }}
                        >
                          <h3 className="text-lg font-semibold">
                            Code Insights
                          </h3>
                          <GitHubInsights
                            data={githubData}
                            isLoading={githubLoading}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {!user?.github_user_id && (
                  <Card className="mt-8">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Github className="h-5 w-5" />
                        GitHub Not Connected
                      </CardTitle>
                      <CardDescription>
                        Connect your GitHub account to see code activity
                        insights
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="text-center py-8">
                        <div className="flex flex-col items-center gap-4">
                          <Github className="h-16 w-16 text-muted-foreground/50" />
                          <div className="space-y-2">
                            <h3 className="font-medium">
                              Track Your Code Activity
                            </h3>
                            <p className="text-sm text-muted-foreground max-w-sm">
                              Connect GitHub to analyze your:
                            </p>
                            <ul className="text-sm text-muted-foreground space-y-1">
                              <li>• Commit patterns and quality</li>
                              <li>• Code review engagement</li>
                              <li>• Repository contributions</li>
                              <li>• Language preferences</li>
                            </ul>
                          </div>
                          <Button
                            onClick={() => {
                              window.location.href = `${
                                process.env.NEXT_PUBLIC_BACKEND_URL
                              }/connect-github?user_email=${encodeURIComponent(
                                user.email
                              )}`;
                            }}
                          >
                            <Github className="h-4 w-4 mr-2" />
                            Connect GitHub
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {user?.google_calendar_connected && (
                  <div className="mt-8">
                    <h2 className="text-2xl font-bold mb-4">
                      CALENDAR ANALYSIS
                    </h2>

                    {/* Tabs for large screens */}
                    <div className="hidden lg:block">
                      <Tabs defaultValue="meetings" className="space-y-4">
                        <TabsList className="grid w-full grid-cols-3 gap-4 mb-6">
                          <TabsTrigger
                            value="meetings"
                            className="whitespace-nowrap text-sm"
                          >
                            Meeting Activity
                          </TabsTrigger>
                          <TabsTrigger
                            value="patterns"
                            className="whitespace-nowrap text-sm"
                          >
                            Meeting Patterns
                          </TabsTrigger>
                          <TabsTrigger
                            value="stats"
                            className="whitespace-nowrap text-sm"
                          >
                            Meeting Stats
                          </TabsTrigger>
                        </TabsList>

                        <div className="space-y-8">
                          <TabsContent value="meetings">
                            <div className="grid gap-4 md:grid-cols-2">
                              <Card>
                                <CardHeader>
                                  <CardTitle>Daily Meeting Count</CardTitle>
                                  <CardDescription>
                                    Number of meetings per day
                                  </CardDescription>
                                </CardHeader>
                                <CardContent className="h-[300px]">
                                  {calendarData?.daily_meeting_counts ? (
                                    <ResponsiveContainer
                                      width="100%"
                                      height="100%"
                                    >
                                      <LineChart
                                        data={Object.entries(
                                          calendarData.daily_meeting_counts
                                        ).map(([date, count]) => ({
                                          date,
                                          count,
                                        }))}
                                      >
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
                                  ) : (
                                    <div className="flex items-center justify-center h-full text-muted-foreground">
                                      No meeting data available
                                    </div>
                                  )}
                                </CardContent>
                              </Card>

                              <Card>
                                <CardHeader>
                                  <CardTitle>
                                    Meeting Types Distribution
                                  </CardTitle>
                                  <CardDescription>
                                    Breakdown of meeting categories
                                  </CardDescription>
                                </CardHeader>
                                <CardContent className="h-[300px]">
                                  {calendarData?.meeting_types ? (
                                    <ResponsiveContainer
                                      width="100%"
                                      height="100%"
                                    >
                                      <PieChart>
                                        <Pie
                                          data={[
                                            {
                                              name: "1:1 Meetings",
                                              value:
                                                calendarData.meeting_types
                                                  .one_on_one,
                                            },
                                            {
                                              name: "Team Meetings",
                                              value:
                                                calendarData.meeting_types
                                                  .team_meetings,
                                            },
                                            {
                                              name: "External Meetings",
                                              value:
                                                calendarData.meeting_types
                                                  .external_meetings,
                                            },
                                          ]}
                                          dataKey="value"
                                          nameKey="name"
                                          cx="50%"
                                          cy="50%"
                                          outerRadius={80}
                                          fill="#8884d8"
                                          label
                                        >
                                          {Object.keys(
                                            calendarData.meeting_types
                                          ).map((_, index) => (
                                            <Cell
                                              key={`cell-${index}`}
                                              fill={
                                                COLORS[index % COLORS.length]
                                              }
                                            />
                                          ))}
                                        </Pie>
                                        <Tooltip />
                                        <Legend />
                                      </PieChart>
                                    </ResponsiveContainer>
                                  ) : (
                                    <div className="flex items-center justify-center h-full text-muted-foreground">
                                      No meeting type data available
                                    </div>
                                  )}
                                </CardContent>
                              </Card>
                            </div>
                          </TabsContent>

                          <TabsContent value="patterns">
                            <div className="grid gap-4 md:grid-cols-2">
                              <Card>
                                <CardHeader>
                                  <CardTitle>Weekly Pattern</CardTitle>
                                  <CardDescription>
                                    Meeting distribution across weekdays
                                  </CardDescription>
                                </CardHeader>
                                <CardContent className="h-[300px]">
                                  {calendarData?.weekly_patterns ? (
                                    <ResponsiveContainer
                                      width="100%"
                                      height="100%"
                                    >
                                      <BarChart
                                        data={Object.entries(
                                          calendarData.weekly_patterns
                                        ).map(([day, count]) => ({
                                          day,
                                          count,
                                        }))}
                                      >
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="day" />
                                        <YAxis />
                                        <Tooltip />
                                        <Bar dataKey="count" fill="#82ca9d" />
                                      </BarChart>
                                    </ResponsiveContainer>
                                  ) : (
                                    <div className="flex items-center justify-center h-full text-muted-foreground">
                                      No weekly pattern data available
                                    </div>
                                  )}
                                </CardContent>
                              </Card>

                              <Card>
                                <CardHeader>
                                  <CardTitle>Hourly Distribution</CardTitle>
                                  <CardDescription>
                                    Meeting times throughout the day
                                  </CardDescription>
                                </CardHeader>
                                <CardContent className="h-[300px]">
                                  {calendarData?.hourly_distribution ? (
                                    <ResponsiveContainer
                                      width="100%"
                                      height="100%"
                                    >
                                      <BarChart
                                        data={Object.entries(
                                          calendarData.hourly_distribution
                                        ).map(([hour, count]) => ({
                                          hour,
                                          count,
                                        }))}
                                      >
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="hour" />
                                        <YAxis />
                                        <Tooltip />
                                        <Bar dataKey="count" fill="#ffc658" />
                                      </BarChart>
                                    </ResponsiveContainer>
                                  ) : (
                                    <div className="flex items-center justify-center h-full text-muted-foreground">
                                      No hourly distribution data available
                                    </div>
                                  )}
                                </CardContent>
                              </Card>
                            </div>
                          </TabsContent>

                          <TabsContent value="stats">
                            <div className="grid gap-4 md:grid-cols-2">
                              <Card>
                                <CardHeader>
                                  <CardTitle className="flex items-center gap-2">
                                    <GalleryVerticalEnd className="h-5 w-5 text-primary" />
                                    Meeting Metrics
                                  </CardTitle>
                                  <CardDescription>
                                    Key meeting statistics and trends
                                  </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                  <div className="space-y-2">
                                    <div className="flex justify-between">
                                      <span className="text-sm font-medium">
                                        Total Meetings
                                      </span>
                                      <span className="text-sm text-muted-foreground">
                                        {calendarData?.total_meetings}
                                      </span>
                                    </div>
                                    <Progress
                                      value={
                                        (calendarData?.total_meetings || 0) / 2
                                      }
                                      className="h-2"
                                    />
                                  </div>

                                  <div className="space-y-2">
                                    <div className="flex justify-between">
                                      <span className="text-sm font-medium">
                                        Average Duration
                                      </span>
                                      <span className="text-sm text-muted-foreground">
                                        {calendarData?.average_meeting_duration?.toFixed(
                                          1
                                        )}{" "}
                                        mins
                                      </span>
                                    </div>
                                    <Progress
                                      value={
                                        (calendarData?.average_meeting_duration ||
                                          0) / 1.2
                                      }
                                      className="h-2"
                                    />
                                  </div>

                                  <div className="space-y-2">
                                    <div className="flex justify-between">
                                      <span className="text-sm font-medium">
                                        Meetings per Day
                                      </span>
                                      <span className="text-sm text-muted-foreground">
                                        {calendarData?.meetings_per_day?.toFixed(
                                          1
                                        )}
                                      </span>
                                    </div>
                                    <Progress
                                      value={
                                        (calendarData?.meetings_per_day || 0) *
                                        10
                                      }
                                      className="h-2"
                                    />
                                  </div>
                                </CardContent>
                              </Card>

                              <Card>
                                <CardHeader>
                                  <CardTitle className="flex items-center gap-2">
                                    <AlertCircle className="h-5 w-5 text-primary" />
                                    Meeting Patterns
                                  </CardTitle>
                                  <CardDescription>
                                    Potential work-life balance indicators
                                  </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                  <div className="grid gap-4">
                                    <div className="flex items-center justify-between">
                                      <div className="space-y-1">
                                        <p className="text-sm font-medium leading-none">
                                          Back-to-Back Meetings
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                          Consecutive meetings without breaks
                                        </p>
                                      </div>
                                      <Badge
                                        variant={
                                          (calendarData?.back_to_back_meetings ||
                                            0) > 5
                                            ? "destructive"
                                            : "secondary"
                                        }
                                      >
                                        {calendarData?.back_to_back_meetings ||
                                          0}
                                      </Badge>
                                    </div>

                                    <div className="flex items-center justify-between">
                                      <div className="space-y-1">
                                        <p className="text-sm font-medium leading-none">
                                          After Hours Meetings
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                          Meetings outside work hours
                                        </p>
                                      </div>
                                      <Badge
                                        variant={
                                          (calendarData?.meetings_after_hours ||
                                            0) > 3
                                            ? "destructive"
                                            : "secondary"
                                        }
                                      >
                                        {calendarData?.meetings_after_hours ||
                                          0}
                                      </Badge>
                                    </div>

                                    <div className="flex items-center justify-between">
                                      <div className="space-y-1">
                                        <p className="text-sm font-medium leading-none">
                                          Early Meetings
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                          Meetings before 9 AM
                                        </p>
                                      </div>
                                      <Badge
                                        variant={
                                          (calendarData?.early_meetings || 0) >
                                          3
                                            ? "destructive"
                                            : "secondary"
                                        }
                                      >
                                        {calendarData?.early_meetings || 0}
                                      </Badge>
                                    </div>

                                    <div className="flex items-center justify-between">
                                      <div className="space-y-1">
                                        <p className="text-sm font-medium leading-none">
                                          Recurring Meetings
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                          Regular scheduled meetings
                                        </p>
                                      </div>
                                      <Badge variant="secondary">
                                        {calendarData?.recurring_meetings || 0}
                                      </Badge>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            </div>
                          </TabsContent>
                        </div>
                      </Tabs>
                    </div>

                    {/* Select menu and stacked cards for medium and smaller screens */}
                    <div className="lg:hidden space-y-6">
                      <Select
                        defaultValue="meetings"
                        onValueChange={(value: string) => {
                          const sections =
                            document.querySelectorAll("[data-section]");
                          sections.forEach((section) => {
                            if (section instanceof HTMLElement) {
                              section.style.display =
                                section.dataset.section === value
                                  ? "block"
                                  : "none";
                            }
                          });
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select view" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="meetings">
                            Meeting Activity
                          </SelectItem>
                          <SelectItem value="patterns">
                            Meeting Patterns
                          </SelectItem>
                          <SelectItem value="stats">Meeting Stats</SelectItem>
                        </SelectContent>
                      </Select>

                      <div className="space-y-8">
                        {/* Meeting Activity Section */}
                        <div data-section="meetings" className="space-y-4">
                          <h3 className="text-lg font-semibold">
                            Meeting Activity
                          </h3>
                          <div className="grid gap-4">
                            <Card>
                              <CardHeader>
                                <CardTitle>Daily Meeting Count</CardTitle>
                                <CardDescription>
                                  Number of meetings per day
                                </CardDescription>
                              </CardHeader>
                              <CardContent className="h-[300px]">
                                {calendarData?.daily_meeting_counts ? (
                                  <ResponsiveContainer
                                    width="100%"
                                    height="100%"
                                  >
                                    <LineChart
                                      data={Object.entries(
                                        calendarData.daily_meeting_counts
                                      ).map(([date, count]) => ({
                                        date,
                                        count,
                                      }))}
                                    >
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
                                ) : (
                                  <div className="flex items-center justify-center h-full text-muted-foreground">
                                    No meeting data available
                                  </div>
                                )}
                              </CardContent>
                            </Card>

                            <Card>
                              <CardHeader>
                                <CardTitle>
                                  Meeting Types Distribution
                                </CardTitle>
                                <CardDescription>
                                  Breakdown of meeting categories
                                </CardDescription>
                              </CardHeader>
                              <CardContent className="h-[300px]">
                                {calendarData?.meeting_types ? (
                                  <ResponsiveContainer
                                    width="100%"
                                    height="100%"
                                  >
                                    <PieChart>
                                      <Pie
                                        data={[
                                          {
                                            name: "1:1 Meetings",
                                            value:
                                              calendarData.meeting_types
                                                .one_on_one,
                                          },
                                          {
                                            name: "Team Meetings",
                                            value:
                                              calendarData.meeting_types
                                                .team_meetings,
                                          },
                                          {
                                            name: "External Meetings",
                                            value:
                                              calendarData.meeting_types
                                                .external_meetings,
                                          },
                                        ]}
                                        dataKey="value"
                                        nameKey="name"
                                        cx="50%"
                                        cy="50%"
                                        outerRadius={80}
                                        fill="#8884d8"
                                        label
                                      >
                                        {Object.keys(
                                          calendarData.meeting_types
                                        ).map((_, index) => (
                                          <Cell
                                            key={`cell-${index}`}
                                            fill={COLORS[index % COLORS.length]}
                                          />
                                        ))}
                                      </Pie>
                                      <Tooltip />
                                      <Legend />
                                    </PieChart>
                                  </ResponsiveContainer>
                                ) : (
                                  <div className="flex items-center justify-center h-full text-muted-foreground">
                                    No meeting type data available
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          </div>
                        </div>

                        {/* Meeting Patterns Section */}
                        <div
                          data-section="patterns"
                          className="space-y-4"
                          style={{ display: "none" }}
                        >
                          <h3 className="text-lg font-semibold">
                            Meeting Patterns
                          </h3>
                          <div className="grid gap-4">
                            <Card>
                              <CardHeader>
                                <CardTitle>Weekly Pattern</CardTitle>
                                <CardDescription>
                                  Meeting distribution across weekdays
                                </CardDescription>
                              </CardHeader>
                              <CardContent className="h-[300px]">
                                {calendarData?.weekly_patterns ? (
                                  <ResponsiveContainer
                                    width="100%"
                                    height="100%"
                                  >
                                    <BarChart
                                      data={Object.entries(
                                        calendarData.weekly_patterns
                                      ).map(([day, count]) => ({
                                        day,
                                        count,
                                      }))}
                                    >
                                      <CartesianGrid strokeDasharray="3 3" />
                                      <XAxis dataKey="day" />
                                      <YAxis />
                                      <Tooltip />
                                      <Bar dataKey="count" fill="#82ca9d" />
                                    </BarChart>
                                  </ResponsiveContainer>
                                ) : (
                                  <div className="flex items-center justify-center h-full text-muted-foreground">
                                    No weekly pattern data available
                                  </div>
                                )}
                              </CardContent>
                            </Card>

                            <Card>
                              <CardHeader>
                                <CardTitle>Hourly Distribution</CardTitle>
                                <CardDescription>
                                  Meeting times throughout the day
                                </CardDescription>
                              </CardHeader>
                              <CardContent className="h-[300px]">
                                {calendarData?.hourly_distribution ? (
                                  <ResponsiveContainer
                                    width="100%"
                                    height="100%"
                                  >
                                    <BarChart
                                      data={Object.entries(
                                        calendarData.hourly_distribution
                                      ).map(([hour, count]) => ({
                                        hour,
                                        count,
                                      }))}
                                    >
                                      <CartesianGrid strokeDasharray="3 3" />
                                      <XAxis dataKey="hour" />
                                      <YAxis />
                                      <Tooltip />
                                      <Bar dataKey="count" fill="#ffc658" />
                                    </BarChart>
                                  </ResponsiveContainer>
                                ) : (
                                  <div className="flex items-center justify-center h-full text-muted-foreground">
                                    No hourly distribution data available
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          </div>
                        </div>

                        {/* Meeting Stats Section */}
                        <div
                          data-section="stats"
                          className="space-y-4"
                          style={{ display: "none" }}
                        >
                          <h3 className="text-lg font-semibold">
                            Meeting Stats
                          </h3>
                          <div className="grid gap-4">
                            <Card>
                              <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                  <GalleryVerticalEnd className="h-5 w-5 text-primary" />
                                  Meeting Metrics
                                </CardTitle>
                                <CardDescription>
                                  Key meeting statistics and trends
                                </CardDescription>
                              </CardHeader>
                              <CardContent className="space-y-6">
                                <div className="space-y-2">
                                  <div className="flex justify-between">
                                    <span className="text-sm font-medium">
                                      Total Meetings
                                    </span>
                                    <span className="text-sm text-muted-foreground">
                                      {calendarData?.total_meetings}
                                    </span>
                                  </div>
                                  <Progress
                                    value={
                                      (calendarData?.total_meetings || 0) / 2
                                    }
                                    className="h-2"
                                  />
                                </div>

                                <div className="space-y-2">
                                  <div className="flex justify-between">
                                    <span className="text-sm font-medium">
                                      Average Duration
                                    </span>
                                    <span className="text-sm text-muted-foreground">
                                      {calendarData?.average_meeting_duration?.toFixed(
                                        1
                                      )}{" "}
                                      mins
                                    </span>
                                  </div>
                                  <Progress
                                    value={
                                      (calendarData?.average_meeting_duration ||
                                        0) / 1.2
                                    }
                                    className="h-2"
                                  />
                                </div>

                                <div className="space-y-2">
                                  <div className="flex justify-between">
                                    <span className="text-sm font-medium">
                                      Meetings per Day
                                    </span>
                                    <span className="text-sm text-muted-foreground">
                                      {calendarData?.meetings_per_day?.toFixed(
                                        1
                                      )}
                                    </span>
                                  </div>
                                  <Progress
                                    value={
                                      (calendarData?.meetings_per_day || 0) * 10
                                    }
                                    className="h-2"
                                  />
                                </div>
                              </CardContent>
                            </Card>

                            <Card>
                              <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                  <AlertCircle className="h-5 w-5 text-primary" />
                                  Meeting Patterns
                                </CardTitle>
                                <CardDescription>
                                  Potential work-life balance indicators
                                </CardDescription>
                              </CardHeader>
                              <CardContent className="space-y-6">
                                <div className="grid gap-4">
                                  <div className="flex items-center justify-between">
                                    <div className="space-y-1">
                                      <p className="text-sm font-medium leading-none">
                                        Back-to-Back Meetings
                                      </p>
                                      <p className="text-sm text-muted-foreground">
                                        Consecutive meetings without breaks
                                      </p>
                                    </div>
                                    <Badge
                                      variant={
                                        (calendarData?.back_to_back_meetings ||
                                          0) > 5
                                          ? "destructive"
                                          : "secondary"
                                      }
                                    >
                                      {calendarData?.back_to_back_meetings || 0}
                                    </Badge>
                                  </div>

                                  <div className="flex items-center justify-between">
                                    <div className="space-y-1">
                                      <p className="text-sm font-medium leading-none">
                                        After Hours Meetings
                                      </p>
                                      <p className="text-sm text-muted-foreground">
                                        Meetings outside work hours
                                      </p>
                                    </div>
                                    <Badge
                                      variant={
                                        (calendarData?.meetings_after_hours ||
                                          0) > 3
                                          ? "destructive"
                                          : "secondary"
                                      }
                                    >
                                      {calendarData?.meetings_after_hours || 0}
                                    </Badge>
                                  </div>

                                  <div className="flex items-center justify-between">
                                    <div className="space-y-1">
                                      <p className="text-sm font-medium leading-none">
                                        Early Meetings
                                      </p>
                                      <p className="text-sm text-muted-foreground">
                                        Meetings before 9 AM
                                      </p>
                                    </div>
                                    <Badge
                                      variant={
                                        (calendarData?.early_meetings || 0) > 3
                                          ? "destructive"
                                          : "secondary"
                                      }
                                    >
                                      {calendarData?.early_meetings || 0}
                                    </Badge>
                                  </div>

                                  <div className="flex items-center justify-between">
                                    <div className="space-y-1">
                                      <p className="text-sm font-medium leading-none">
                                        Recurring Meetings
                                      </p>
                                      <p className="text-sm text-muted-foreground">
                                        Regular scheduled meetings
                                      </p>
                                    </div>
                                    <Badge variant="secondary">
                                      {calendarData?.recurring_meetings || 0}
                                    </Badge>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {!user?.google_calendar_connected && (
                  <Card className="mt-8">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Calendar className="h-5 w-5" />
                        Calendar Not Connected
                      </CardTitle>
                      <CardDescription>
                        Connect your Google Calendar to see meeting insights
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="text-center py-8">
                        <div className="flex flex-col items-center gap-4">
                          <Calendar className="h-16 w-16 text-muted-foreground/50" />
                          <div className="space-y-2">
                            <h3 className="font-medium">
                              Analyze Your Meetings
                            </h3>
                            <p className="text-sm text-muted-foreground max-w-sm">
                              Connect Google Calendar to track your:
                            </p>
                            <ul className="text-sm text-muted-foreground space-y-1">
                              <li>• Meeting load and patterns</li>
                              <li>• Work-life balance</li>
                              <li>• Focus time availability</li>
                              <li>• Team collaboration metrics</li>
                            </ul>
                          </div>
                          <Button
                            onClick={() => {
                              window.location.href = `${process.env.NEXT_PUBLIC_BACKEND_URL}/connect-google`;
                            }}
                          >
                            <Calendar className="h-4 w-4 mr-2" />
                            Connect Calendar
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {githubLoading && (
              <LoadingSpinner text="Analyzing GitHub activity" />
            )}

            {calendarLoading && (
              <LoadingSpinner text="Analyzing Calendar activity" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
