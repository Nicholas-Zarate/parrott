import { ActivitiesList } from "@/components/activities-list";

export const dynamic = "force-dynamic";

export default function ActivitiesPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-foreground">Activities</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Events from presence updates: game starts, late-night sessions,
        comebacks, and more. Table:{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
          activity_listeners
        </code>
      </p>

      <div className="mt-6">
        <ActivitiesList />
      </div>
    </div>
  );
}
