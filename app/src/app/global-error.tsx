"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isDev = process.env.NODE_ENV === "development";
  return (
    <html lang="en">
      <body style={{ background: "#0a0a0f", color: "#fff", fontFamily: "system-ui", padding: "2rem" }}>
        <h1 style={{ color: "#00ffa3" }}>Something went wrong</h1>
        <p style={{ color: "#a0a0b0", marginTop: "0.5rem" }}>
          An unexpected error occurred. Please try again.
        </p>
        {isDev && (
          <pre style={{ background: "#1c1c24", padding: "1rem", overflow: "auto", fontSize: "12px", marginTop: "1rem" }}>
            {error.message}
          </pre>
        )}
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: "1rem",
            padding: "0.5rem 1rem",
            background: "#00ffa3",
            color: "#0a0a0f",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
