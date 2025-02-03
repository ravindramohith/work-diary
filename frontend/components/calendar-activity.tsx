"use client";

import { useQuery } from "@tanstack/react-query";
import { authenticatedRequest } from "@/utils/auth";
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
  AreaChart,
  Area,
} from "recharts";

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8"];

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

interface CalendarActivityProps {
  data: CalendarData | undefined;
  isLoading: boolean;
}

export function CalendarActivity({ data, isLoading }: CalendarActivityProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Transform data for charts
  const dailyMeetings = data?.daily_meeting_counts
    ? Object.entries(data.daily_meeting_counts).map(([date, count]) => ({
        date,
        count,
      }))
    : [];

  const weeklyPatterns = data?.weekly_patterns
    ? Object.entries(data.weekly_patterns).map(([day, count]) => ({
        day,
        meetings: count,
      }))
    : [];

  const hourlyDistribution = data?.hourly_distribution
    ? Object.entries(data.hourly_distribution).map(([hour, count]) => ({
        hour: `${hour}:00`,
        meetings: count,
      }))
    : [];

  const meetingTypes = data?.meeting_types
    ? [
        { name: "One-on-One", value: data.meeting_types.one_on_one },
        { name: "Team Meetings", value: data.meeting_types.team_meetings },
        { name: "External", value: data.meeting_types.external_meetings },
      ]
    : [];

  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Daily Meeting Count</CardTitle>
          <CardDescription>Number of meetings per day</CardDescription>
        </CardHeader>
        <CardContent className="h-[300px]">
          {dailyMeetings.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyMeetings}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#8884d8"
                  name="Meetings"
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
          <CardTitle>Meeting Types</CardTitle>
          <CardDescription>Distribution of meeting categories</CardDescription>
        </CardHeader>
        <CardContent className="h-[300px]">
          {meetingTypes.some((type) => type.value > 0) ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={meetingTypes}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  fill="#8884d8"
                  label
                >
                  {meetingTypes.map((entry, index) => (
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

      <Card>
        <CardHeader>
          <CardTitle>Weekly Pattern</CardTitle>
          <CardDescription>Meeting distribution by day</CardDescription>
        </CardHeader>
        <CardContent className="h-[300px]">
          {weeklyPatterns.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weeklyPatterns}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip />
                <Area 
                  type="monotone"
                  dataKey="meetings"
                  stroke="#06b6d4"
                  fill="#06b6d4"
                  fillOpacity={0.3}
                  name="Meetings"
                />
              </AreaChart>
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
          <CardDescription>Meeting times throughout the day</CardDescription>
        </CardHeader>
        <CardContent className="h-[300px]">
          {hourlyDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyDistribution}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="meetings" fill="#ffc658" name="Meetings" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              No hourly distribution data available
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Meeting Statistics</CardTitle>
          <CardDescription>Key meeting metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm">
                <span>Total Meetings</span>
                <span className="font-medium">{data?.total_meetings}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Average Duration</span>
                <span className="font-medium">
                  {data?.average_meeting_duration?.toFixed(0)} mins
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Meetings per Day</span>
                <span className="font-medium">
                  {data?.meetings_per_day?.toFixed(1)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Back-to-Back Meetings</span>
                <span className="font-medium">
                  {data?.back_to_back_meetings}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span>After Hours Meetings</span>
                <span className="font-medium">
                  {data?.meetings_after_hours}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Early Meetings</span>
                <span className="font-medium">{data?.early_meetings}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Recurring Meetings</span>
                <span className="font-medium">{data?.recurring_meetings}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
