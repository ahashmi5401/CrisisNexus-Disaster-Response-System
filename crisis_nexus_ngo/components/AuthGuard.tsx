"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";

export const AuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { authState, profileState } = useAuth();
  const router = useRouter();

  const shouldRedirect = authState === "unauthenticated" || (authState === "authenticated" && profileState === "missing");

  useEffect(() => {
    if (shouldRedirect) {
      router.replace("/login");
    }
  }, [router, shouldRedirect]);

  const renderSkeleton = () => (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-6 antialiased animate-pulse">
      {/* Skeleton Top Navbar */}
      <header className="flex items-center justify-between border-b border-zinc-900 pb-4 mb-6">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-zinc-800"></div>
          <div className="w-32 h-6 rounded bg-zinc-800"></div>
        </div>
        <div className="w-10 h-10 rounded-full bg-zinc-800"></div>
      </header>

      {/* Skeleton Layout Body */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Skeleton Side Nav */}
        <aside className="hidden md:flex flex-col space-y-4 pr-4 border-r border-zinc-900">
          <div className="w-full h-10 rounded bg-zinc-800"></div>
          <div className="w-full h-10 rounded bg-zinc-850"></div>
          <div className="w-full h-10 rounded bg-zinc-850"></div>
          <div className="w-full h-10 rounded bg-zinc-850"></div>
        </aside>

        {/* Skeleton Main Grid */}
        <main className="md:col-span-3 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="h-28 rounded-xl bg-zinc-900/60 border border-zinc-900"></div>
            <div className="h-28 rounded-xl bg-zinc-900/60 border border-zinc-900"></div>
            <div className="h-28 rounded-xl bg-zinc-900/60 border border-zinc-900"></div>
          </div>
          <div className="h-96 rounded-2xl bg-zinc-900/40 border border-zinc-900"></div>
        </main>
      </div>
    </div>
  );

  // Return a skeleton while auth/profile state is still resolving.
  if (authState === "loading" || (authState === "authenticated" && profileState === "loading")) {
    return renderSkeleton();
  }

  if (shouldRedirect) {
    return null; // Let useEffect trigger router redirect safely without layout leakage
  }

  return <>{children}</>;
};
