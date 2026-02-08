"use client";

import { useEffect, useRef, useId } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  /** Optional: position content below header (e.g. top: 5rem). Default: centered. */
  belowHeader?: boolean;
}

export default function Modal({ title, children, onClose, belowHeader }: ModalProps) {
  const titleId = useId();
  const previousActiveRef = useRef<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    previousActiveRef.current = document.activeElement as HTMLElement | null;
    const focusable = containerRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusable?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousActiveRef.current?.focus?.();
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  const content = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
      aria-labelledby={titleId}
    >
      <div
        ref={containerRef}
        className={
          belowHeader
            ? "fixed left-0 right-0 bottom-0 flex items-center justify-center p-4"
            : "flex items-center justify-center w-full min-h-0"
        }
        style={belowHeader ? { top: "5rem" } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[var(--bg-secondary)] border border-white/10 rounded-xl p-6 shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
          <h2 id={titleId} className="font-semibold mb-2 text-lg">
            {title}
          </h2>
          {children}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
