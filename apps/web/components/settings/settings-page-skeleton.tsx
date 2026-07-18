import { Skeleton } from "@/components/ui/skeleton";

export function SettingsPageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-10 w-56 rounded-lg" />
      {[1, 2, 3].map((i) => (
        <section
          key={i}
          className="overflow-hidden rounded-xl border border-border bg-card"
        >
          <div className="border-b border-border px-5 py-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-2 h-4 w-56" />
          </div>
          <div className="space-y-4 p-5">
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        </section>
      ))}
    </div>
  );
}
