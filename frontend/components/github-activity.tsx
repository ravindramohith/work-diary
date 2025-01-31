"use client";

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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Github } from "lucide-react";

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8"];

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

interface GitHubActivityProps {
  data: GitHubData | undefined;
  isLoading: boolean;
  user: any;
}

export function GitHubActivity({
  data: githubData,
  isLoading,
  user,
}: GitHubActivityProps) {
  // Transform GitHub data for charts
  const githubActivityData = githubData?.events_by_day
    ? Object.entries(githubData.events_by_day).map(([date, events]) => ({
        date,
        PushEvent: events.PushEvent || 0,
        PullRequestEvent: events.PullRequestEvent || 0,
        IssuesEvent: events.IssuesEvent || 0,
        PullRequestReviewEvent: events.PullRequestReviewEvent || 0,
      }))
    : [];

  const githubSummaryData = [
    { name: "Commits", value: githubData?.commit_count || 0 },
    { name: "Pull Requests", value: githubData?.pr_count || 0 },
    { name: "Reviews", value: githubData?.review_count || 0 },
    { name: "Issues", value: githubData?.issue_count || 0 },
    { name: "Comments", value: githubData?.comment_count || 0 },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user?.github_user_id) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Connect GitHub to View Analytics</CardTitle>
          <CardDescription>
            Please connect your GitHub account to view your coding activity
            analytics.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() =>
              (window.location.href = `${process.env.NEXT_PUBLIC_BACKEND_URL}/connect-github?user_email=${user?.email}`)
            }
          >
            <Github className="mr-2 h-4 w-4" />
            Connect GitHub
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Daily Activity</CardTitle>
          <CardDescription>GitHub events over time</CardDescription>
        </CardHeader>
        <CardContent className="h-[300px]">
          {githubActivityData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={githubActivityData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="PushEvent" stroke="#8884d8" />
                <Line
                  type="monotone"
                  dataKey="PullRequestEvent"
                  stroke="#82ca9d"
                />
                <Line type="monotone" dataKey="IssuesEvent" stroke="#ffc658" />
                <Line
                  type="monotone"
                  dataKey="PullRequestReviewEvent"
                  stroke="#ff7300"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              No activity data available
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Activity Summary</CardTitle>
          <CardDescription>
            Distribution of different activities
          </CardDescription>
        </CardHeader>
        <CardContent className="h-[300px]">
          {githubSummaryData.some((item) => item.value > 0) ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={githubSummaryData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  fill="#8884d8"
                  label
                >
                  {githubSummaryData.map((entry, index) => (
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
              No activity summary available
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Language Distribution</CardTitle>
          <CardDescription>Programming languages used</CardDescription>
        </CardHeader>
        <CardContent className="h-[300px]">
          {githubData?.language_distribution &&
          githubData.language_distribution.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={githubData.language_distribution}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  fill="#8884d8"
                  label={({ name, value }) => `${name} (${value.toFixed(1)}%)`}
                >
                  {githubData.language_distribution.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => `${Number(value).toFixed(1)}%`}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              No language data available
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active Repositories</CardTitle>
          <CardDescription>
            {githubData?.active_repos.length} active repositories
          </CardDescription>
        </CardHeader>
        <CardContent className="h-[300px] overflow-auto">
          <div className="space-y-4">
            {githubData?.active_repos.map((repo) => (
              <div
                key={repo}
                className="flex items-center p-2 rounded-lg border bg-card text-card-foreground shadow-sm"
              >
                <Github className="h-4 w-4 mr-2 text-muted-foreground" />
                <span className="text-sm font-medium">{repo}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
