"use client";

import { useEffect, useState } from "react";

function formatLocalDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function LocalDateTime({ value }: { value: string | null }) {
  const [formatted, setFormatted] = useState<string | null>(null);

  useEffect(() => {
    setFormatted(value ? formatLocalDateTime(value) : null);
  }, [value]);

  if (!value) return <>Not returned by GHL</>;

  return <time dateTime={value} title={value}>{formatted ?? "Formatting local time…"}</time>;
}
