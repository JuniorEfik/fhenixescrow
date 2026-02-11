"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { setRuntimeConfig, type AppConfig } from "@/lib/constants";

const ConfigContext = createContext<{ configReady: boolean; config: AppConfig | null }>({
  configReady: false,
  config: null,
});

export function useConfig() {
  return useContext(ConfigContext);
}

/** Shown when config loaded but ESCROW_CONTRACT_ADDRESS is missing (e.g. not set in Netlify). */
function MissingConfigScreen() {
  const isNetlify = typeof window !== "undefined" && /netlify\.app$/i.test(window.location.hostname);
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] text-white p-6">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-xl font-semibold text-red-300">Configuration missing</h1>
        <p className="text-[var(--text-primary)]/90">
          Escrow contract address is not set. Values are loaded via the server and are never exposed in the client.
        </p>
        {isNetlify ? (
          <div className="text-left bg-[#1a1a24] rounded-lg p-4 text-sm space-y-2">
            <p className="font-medium">On Netlify:</p>
            <ol className="list-decimal list-inside space-y-1 text-[var(--text-primary)]/80">
              <li>Open your site in the Netlify Dashboard</li>
              <li>Go to <strong>Site configuration</strong> → <strong>Environment variables</strong></li>
              <li>Add <code className="bg-black/30 px-1 rounded">ESCROW_CONTRACT_ADDRESS</code> with your deployed contract address</li>
              <li>Redeploy or wait for the next deploy so the serverless function picks it up</li>
            </ol>
            <p className="text-[var(--text-primary)]/70 pt-2">
              Use the same variable names as in <code className="text-xs">app/.env.example</code> (server-only names, no <code className="text-xs">NEXT_PUBLIC_</code>). Your local <code className="text-xs">.env</code> file is not deployed to Netlify.
            </p>
          </div>
        ) : (
          <p className="text-sm text-[var(--text-primary)]/70">
            Locally: set <code className="bg-black/30 px-1 rounded">NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS</code> in <code className="text-xs">app/.env</code>, or run the app with env vars set.
          </p>
        )}
      </div>
    </div>
  );
}

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [configReady, setConfigReady] = useState(false);
  const [config, setConfig] = useState<AppConfig | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/config");
      if (!res.ok) throw new Error("Config fetch failed");
      const data: AppConfig = await res.json();
      setRuntimeConfig(data);
      setConfig(data);
    } catch {
      // Fallback to env (e.g. NEXT_PUBLIC_* in local dev) is handled in getters
    } finally {
      setConfigReady(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const missingEscrow = configReady && (!config || !config.escrowContractAddress?.trim());

  return (
    <ConfigContext.Provider value={{ configReady, config }}>
      {!configReady ? (
        <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] text-white">
          <div className="text-center">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[var(--solana-green)]/30 border-t-[var(--solana-green)] mb-3" aria-hidden />
            <p className="text-sm text-[var(--text-muted)]">Loading…</p>
          </div>
        </div>
      ) : missingEscrow ? (
        <MissingConfigScreen />
      ) : (
        children
      )}
    </ConfigContext.Provider>
  );
}
