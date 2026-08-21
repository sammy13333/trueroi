"use client";

import { useSyncExternalStore } from "react";

function formatLocalDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function subscribe() {
  return () => {};
}

export function LocalDateTime({ value }: { value: string | null }) {
  const formatted = useSyncExternalStore(
    subscribe,
    () => value ? formatLocalDateTime(value) : null,
    () => null,
  );

  if (!value) return <>Not returned by GHL</>;

  return <time dateTime={value} title={value}>{formatted ?? "Formatting local time…"}</time>;
}
