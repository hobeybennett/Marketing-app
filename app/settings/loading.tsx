import { SkeletonBar, SkeletonHeader } from '@/components/Skeleton';

export default function Loading() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <SkeletonHeader subtitle={false} />

      {/* Account / Meta connection panels */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-4 space-y-3">
          <SkeletonBar className="h-4 w-28" />
          <SkeletonBar className="h-3 w-2/3" />
          <SkeletonBar className="h-9 w-40" />
        </div>
      ))}
    </div>
  );
}
