import { SkeletonBar, SkeletonRow, SkeletonHeader } from '@/components/Skeleton';

export default function Loading() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <SkeletonHeader />

      {/* Creator card */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-8 space-y-3">
        <SkeletonBar className="h-4 w-32" />
        <SkeletonBar className="h-3 w-3/4" />
        <SkeletonBar className="h-10 w-full" />
      </div>

      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </div>
  );
}
