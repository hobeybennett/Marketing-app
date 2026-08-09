import { SkeletonBar, SkeletonRow, SkeletonHeader } from '@/components/Skeleton';

export default function Loading() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <SkeletonHeader subtitle={false} />
        <SkeletonBar className="h-9 w-32" />
      </div>

      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </div>
  );
}
