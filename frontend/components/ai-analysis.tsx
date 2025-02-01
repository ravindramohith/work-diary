import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Target,
  CheckCircle2,
  ArrowUpCircle,
  Trophy,
} from "lucide-react";

interface AIAnalysisProps {
  data: {
    greeting: string;
    key_patterns: string[];
    working_well: string[];
    opportunity_areas: string[];
    weekly_goal: {
      title: string;
      steps: string[];
    };
    sign_off: string;
  };
  isLoading: boolean;
}

function LoadingSparkles() {
  return (
    <motion.div
      className="flex items-center gap-2"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          rotate: [0, 360],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        <Sparkles className="h-5 w-5 text-yellow-500" />
      </motion.div>
      <div className="h-4 w-48 bg-primary/10 rounded animate-pulse" />
    </motion.div>
  );
}

export function AIAnalysis({ data, isLoading }: AIAnalysisProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-yellow-500" />
            AI Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <LoadingSparkles key={i} />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card>
        <CardHeader>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <CardTitle className="flex items-center gap-2 mb-4">
              <Sparkles className="h-5 w-5 text-yellow-500" />
              AI Analysis
            </CardTitle>
            <p className="text-lg font-medium text-primary">{data.greeting}</p>
          </motion.div>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* Key Patterns */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-4"
          >
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-blue-500" />
              Key Patterns
            </h3>
            <div className="grid gap-3">
              {data.key_patterns.map((pattern, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + index * 0.1 }}
                  className="flex items-start gap-2 text-sm text-muted-foreground"
                >
                  <Badge variant="outline" className="mt-0.5">
                    {index + 1}
                  </Badge>
                  {pattern}
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Working Well */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 }}
            className="space-y-4"
          >
            <h3 className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              What's Working Well
            </h3>
            <div className="grid gap-3">
              {data.working_well.map((point, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.7 + index * 0.1 }}
                  className="flex items-start gap-2 text-sm text-muted-foreground"
                >
                  <Badge
                    variant="secondary"
                    className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                  >
                    ✓
                  </Badge>
                  {point}
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Opportunity Areas */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.9 }}
            className="space-y-4"
          >
            <h3 className="text-sm font-medium flex items-center gap-2">
              <ArrowUpCircle className="h-4 w-4 text-amber-500" />
              Opportunity Areas
            </h3>
            <div className="grid gap-3">
              {data.opportunity_areas.map((area, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 1 + index * 0.1 }}
                  className="flex items-start gap-2 text-sm text-muted-foreground"
                >
                  <Badge
                    variant="outline"
                    className="border-amber-500/50 text-amber-700 dark:text-amber-300"
                  >
                    {index + 1}
                  </Badge>
                  {area}
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Weekly Goals */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1.2 }}
            className="space-y-4"
          >
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Trophy className="h-4 w-4 text-purple-500" />
              {data.weekly_goal.title}
            </h3>
            <div className="grid gap-3">
              {data.weekly_goal.steps.map((step, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 1.3 + index * 0.1 }}
                  className="flex items-start gap-2 text-sm text-muted-foreground"
                >
                  <Badge className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                    {index + 1}
                  </Badge>
                  {step}
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Sign Off */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
            className="pt-4 border-t"
          >
            <p className="text-sm text-muted-foreground italic">
              {data.sign_off}
            </p>
          </motion.div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
