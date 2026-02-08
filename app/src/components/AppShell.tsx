"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class AppShell extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error("AppShell caught:", error);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div
          style={{
            minHeight: "100vh",
            background: "#0a0a0f",
            color: "#fff",
            padding: "2rem",
            fontFamily: "system-ui",
          }}
        >
          <h1 style={{ color: "#00ffa3", marginBottom: "1rem" }}>Something went wrong</h1>
          <pre
            style={{
              background: "#1c1c24",
              padding: "1rem",
              overflow: "auto",
              fontSize: "12px",
              marginBottom: "1rem",
            }}
          >
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
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
        </div>
      );
    }
    return this.props.children;
  }
}
