export default function ContractLoading() {
  return (
    <main className="pt-24 px-4 max-w-4xl mx-auto pb-12">
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-64 bg-white/10 rounded" />
        <div className="rounded-xl bg-[var(--bg-secondary)] border border-white/10 p-6 space-y-4">
          <div className="h-6 w-3/4 bg-white/10 rounded" />
          <div className="h-4 w-1/2 bg-white/5 rounded" />
          <div className="h-20 bg-white/5 rounded" />
          <div className="grid grid-cols-2 gap-4">
            <div className="h-24 bg-white/5 rounded-lg" />
            <div className="h-24 bg-white/5 rounded-lg" />
          </div>
        </div>
        <div className="h-32 bg-[var(--bg-secondary)] rounded-xl" />
      </div>
    </main>
  );
}
