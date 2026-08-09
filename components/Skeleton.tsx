// Shared building blocks for route loading states (app/**/loading.tsx). These
// render the instant Next.js shows a navigation start, so tapping a nav item
// gives immediate feedback instead of a dead pause while data loads.

export function SkeletonBar({ className = '' }: { className?: string }) {
  return <div className={`bg-gray-800 rounded animate-pulse ${className}`} />;
}

// A generic row matching the card layout used by the campaign and smart-link
// lists: square thumbnail, two lines of text, a trailing stat.
export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl p-4">
      <SkeletonBar className="w-12 h-12 shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <SkeletonBar className="h-3.5 w-1/2" />
        <SkeletonBar className="h-3 w-1/3" />
      </div>
      <SkeletonBar className="h-8 w-10 shrink-0" />
    </div>
  );
}

export function SkeletonHeader({ subtitle = true }: { subtitle?: boolean }) {
  return (
    <div className="mb-6 space-y-2">
      <SkeletonBar className="h-7 w-40" />
      {subtitle && <SkeletonBar className="h-3.5 w-64 max-w-full" />}
    </div>
  );
}
