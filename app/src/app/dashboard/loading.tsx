export default function DashboardLoading() {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] pt-14">
      <aside className="w-56 shrink-0 border-r border-white/10 bg-[var(--bg-primary)] animate-pulse">
        <div className="p-4 h-12 bg-white/5 rounded m-4" />
        <div className="p-3 space-y-2">
          <div className="h-10 bg-white/5 rounded-lg" />
          <div className="h-10 bg-white/5 rounded-lg" />
          <div className="h-10 bg-white/5 rounded-lg" />
        </div>
      </aside>
      <main className="flex-1 p-6 lg:p-8">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="h-8 w-48 bg-white/10 rounded animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-[var(--bg-secondary)] rounded-xl animate-pulse" />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-36 bg-[var(--bg-secondary)] rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
