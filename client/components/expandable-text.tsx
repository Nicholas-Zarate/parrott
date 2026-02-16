"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

export function ExpandableText({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = textRef.current;
    if (el && !expanded) {
      setClamped(el.scrollHeight > el.clientHeight);
    }
  }, [children, expanded]);

  return (
    <div>
      <p
        ref={textRef}
        className={cn(className, !expanded && "line-clamp-3")}
      >
        {children}
      </p>
      {(clamped || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="mt-1 text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
        >
          {expanded ? "show less" : "read more"}
        </button>
      )}
    </div>
  );
}
