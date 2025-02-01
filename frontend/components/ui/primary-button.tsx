import React from "react";
import { motion } from "framer-motion";

const PrimaryButton = ({
  title,
  icon,
  position,
  handleClick,
  otherClasses,
  type = "button",
}: {
  title: string;
  icon: React.ReactNode;
  position: string;
  handleClick?: () => void;
  otherClasses?: string;
  type?: "button" | "submit" | "reset";
}) => {
  return (
    <motion.button
      type={type}
      className={`inline-flex h-12 animate-shimmer gap-2 items-center justify-center rounded-md border border-[#02b196] bg-[linear-gradient(110deg,#1d1d1d,45%,#02b196,55%,#1d1d1d)] bg-[length:200%_100%] px-8 py-4 font-medium text-white transition-colors focus:outline-none ${otherClasses}`}
      initial={{
        backgroundImage:
          "linear-gradient(110deg,#1d1d1d,45%,#02b196,55%,#1d1d1d)",
      }}
      whileHover={{
        backgroundImage:
          "linear-gradient(110deg,#02b196,45%,#08fdd8,55%,#02b196)",
        backgroundSize: "200% 100%",
        color: "#1d1d1d",
        transition: { delay: 0, duration: 0.1, ease: "linear" },
      }}
      onClick={handleClick}
    >
      {position === "left" && icon}
      {title}
      {position === "right" && icon}
    </motion.button>
  );
};

export default PrimaryButton;
