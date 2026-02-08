"use client";

import { Suspense, lazy } from "react";

const CreatePageContent = lazy(() => import("./CreatePageContent"));

function CreateFallback() {
  return (
    <main className="pt-24 px-4 max-w-lg mx-auto">
      <div className="animate-pulse bg-[var(--bg-secondary)] rounded-xl h-64 flex items-center justify-center text-[var(--text-muted)] text-sm">
        Loading...
      </div>
    </main>
  );
}

export default function CreatePage() {
  return (
    <Suspense fallback={<CreateFallback />}>
      <CreatePageContent />
    </Suspense>
  );
}
