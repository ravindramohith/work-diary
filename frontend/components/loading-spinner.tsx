import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

interface LoadingSpinnerProps {
  text?: string;
}

export function LoadingSpinner({ text = "Loading data" }: LoadingSpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <div className="relative">
        <motion.div
          className="absolute inset-0"
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
          <div className="w-16 h-16 rounded-full border-4 border-primary/20" />
        </motion.div>

        <motion.div
          animate={{
            rotate: [0, -360],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "linear",
          }}
        >
          <Loader2 className="w-16 h-16 text-primary animate-pulse" />
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex flex-col items-center gap-2"
      >
        <h3 className="text-lg font-semibold text-primary">{text}</h3>
        <motion.div
          animate={{
            scale: [1, 1.1, 1],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="flex gap-1"
        >
          <motion.div
            animate={{
              y: [0, -5, 0],
            }}
            transition={{
              duration: 0.6,
              repeat: Infinity,
              repeatDelay: 0.1,
            }}
            className="w-2 h-2 rounded-full bg-primary"
          />
          <motion.div
            animate={{
              y: [0, -5, 0],
            }}
            transition={{
              duration: 0.6,
              repeat: Infinity,
              repeatDelay: 0.2,
            }}
            className="w-2 h-2 rounded-full bg-primary"
          />
          <motion.div
            animate={{
              y: [0, -5, 0],
            }}
            transition={{
              duration: 0.6,
              repeat: Infinity,
              repeatDelay: 0.3,
            }}
            className="w-2 h-2 rounded-full bg-primary"
          />
        </motion.div>
      </motion.div>
    </div>
  );
}
