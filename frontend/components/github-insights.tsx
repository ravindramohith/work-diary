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
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/loading-spinner";
import {
  GitCommit,
  Code2,
  CheckCircle2,
  AlertCircle,
  Star,
  Lightbulb,
  Sparkles,
  ArrowUpCircle,
  CheckCircle,
  PlusCircle,
  FileCode2,
  ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface GitHubData {
  commit_quality: {
    score: number;
    strengths: string[];
    improvements: string[];
  };
  code_quality: {
    score: number;
    strengths: string[];
    improvements: string[];
  };
  best_practices: {
    followed: string[];
    suggested: string[];
  };
  summary: string;
}

interface GitHubInsightsProps {
  data: any;
  isLoading: boolean;
}

export function GitHubInsights({ data, isLoading }: GitHubInsightsProps) {
  const { data: insightsData, isLoading: insightsLoading } =
    useQuery<GitHubData>({
      queryKey: ["github-insights", data?.commit_count],
      queryFn: async () => {
        const response = await authenticatedRequest("/github/code-quality");
        return response.data;
      },
      enabled: !!data?.commit_count,
    });

  if (isLoading || insightsLoading) {
    return <LoadingSpinner text="Analyzing code quality" />;
  }

  if (!insightsData) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-muted-foreground">
        No code quality insights available
      </div>
    );
  }

  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCode2 className="h-5 w-5 text-primary" />
            Code Quality Score
          </CardTitle>
          <CardDescription>AI-powered code quality analysis</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GitCommit className="h-4 w-4 text-blue-500 dark:text-blue-400" />
                  <span className="text-sm font-medium">Commit Quality</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {insightsData.commit_quality.score}/10
                </span>
              </div>
              <Progress
                value={insightsData.commit_quality.score * 10}
                className="bg-blue-100 dark:bg-blue-950"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
                  <span className="text-sm font-medium">Code Quality</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {insightsData.code_quality.score}/10
                </span>
              </div>
              <Progress
                value={insightsData.code_quality.score * 10}
                className="bg-indigo-100 dark:bg-indigo-950"
              />
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <Star className="h-4 w-4 text-yellow-500 dark:text-yellow-400" />
                Strengths
              </h4>
              <div className="flex flex-wrap gap-2">
                {insightsData.code_quality.strengths.map((strength, index) => (
                  <Badge
                    key={index}
                    variant="secondary"
                    className="flex items-center gap-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    {strength}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                Areas for Improvement
              </h4>
              <div className="flex flex-wrap gap-2">
                {insightsData.code_quality.improvements.map(
                  (improvement, index) => (
                    <Badge
                      key={index}
                      variant="outline"
                      className="flex items-center gap-1 border-amber-500/50 text-amber-700 dark:text-amber-300"
                    >
                      <ArrowUpCircle className="h-3 w-3" />
                      {improvement}
                    </Badge>
                  )
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-primary" />
            Best Practices
          </CardTitle>
          <CardDescription>Development practices analysis</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="space-y-2">
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-green-500 dark:text-green-400" />
                Followed Practices
              </h4>
              <div className="space-y-2">
                {insightsData.best_practices.followed.map((practice, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 text-sm text-muted-foreground group hover:text-green-600 dark:hover:text-green-400 transition-colors"
                  >
                    <Badge
                      variant="secondary"
                      className="w-6 h-6 flex items-center justify-center p-0 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 group-hover:bg-green-200 dark:group-hover:bg-green-900/50"
                    >
                      <CheckCircle className="h-4 w-4" />
                    </Badge>
                    {practice}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                Suggested Improvements
              </h4>
              <div className="space-y-2">
                {insightsData.best_practices.suggested.map(
                  (suggestion, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 text-sm text-muted-foreground group hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                    >
                      <Badge
                        variant="outline"
                        className="w-6 h-6 flex items-center justify-center p-0 border-amber-500/50 text-amber-700 dark:text-amber-300 group-hover:border-amber-500"
                      >
                        <PlusCircle className="h-4 w-4" />
                      </Badge>
                      {suggestion}
                    </div>
                  )
                )}
              </div>
            </div>

            <div className="mt-6 p-4 bg-muted rounded-lg border border-border">
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <FileCode2 className="h-4 w-4 text-primary" />
                Summary
              </h4>
              <p className="text-sm text-muted-foreground">
                {insightsData.summary}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
