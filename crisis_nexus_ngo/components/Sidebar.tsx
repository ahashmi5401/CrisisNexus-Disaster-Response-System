"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { 
  ShieldAlert, 
  LayoutDashboard, 
  BarChart3, 
  Map, 
  Activity, 
  LogOut, 
  Menu, 
  X,
  User as UserIcon
} from "lucide-react";

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const { user, operatorProfile, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { name: "Live Feed", path: "/", icon: <LayoutDashboard className="w-5 h-5" /> },
    { name: "Analytics", path: "/analytics", icon: <BarChart3 className="w-5 h-5" /> },
    { name: "Crisis Map", path: "/map", icon: <Map className="w-5 h-5" /> },
    { name: "Response Panel", path: "/response", icon: <Activity className="w-5 h-5" /> },
  ];

  const handleLinkClick = () => {
    setMobileOpen(false);
  };

  const formattedName = operatorProfile?.displayName ? operatorProfile.displayName : "NGO Operator";
  const formattedRole = operatorProfile?.role ? operatorProfile.role : "Active Duty";
  const formattedContact = user ? (user.phoneNumber || user.email || "") : "";

  const renderNavLinks = () => {
    return navItems.map((item) => {
      const isActive = pathname === item.path;
      return (
        <Link
          key={item.path}
          href={item.path}
          onClick={handleLinkClick}
          className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
            isActive
              ? "bg-blue-600/10 text-blue-400 border border-blue-800/30 shadow-[0_0_15px_rgba(37,99,235,0.05)]"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30 border border-transparent"
          }`}
        >
          {item.icon}
          <span>{item.name}</span>
        </Link>
      );
    });
  };

  return (
    <>
      {/* Mobile Top Navigation Navbar */}
      <header className="md:hidden flex items-center justify-between bg-zinc-950/80 backdrop-blur-md border-b border-zinc-900 px-4 py-3 sticky top-0 z-40">
        <div className="flex items-center space-x-2">
          <img src="/crisisnexus-loader.svg" alt="CrisisNexus Logo" className="w-6 h-6 animate-pulse" />
          <span className="text-base font-bold text-slate-100 uppercase tracking-wider">CrisisNexus</span>
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 text-zinc-400 hover:text-zinc-200 focus:outline-none"
        >
          {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {/* Mobile Nav Drawer Overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 bg-slate-950/95 backdrop-blur-md z-30 flex flex-col pt-16 px-6 pb-6 space-y-6">
          <div className="flex-1 flex flex-col space-y-2 mt-4">
            {renderNavLinks()}
          </div>
          
          <div className="border-t border-zinc-900 pt-4 flex flex-col space-y-4">
            <div className="flex items-center space-x-3 px-2">
              <div className="w-8 h-8 rounded-full bg-zinc-850 flex items-center justify-center border border-zinc-800">
                <UserIcon className="w-4 h-4 text-zinc-400" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-zinc-300">{formattedName}</span>
                {formattedContact && <span className="text-[10px] text-zinc-500 font-mono mt-0.5">{formattedContact}</span>}
              </div>
            </div>
            <button
              onClick={() => {
                logout();
                setMobileOpen(false);
              }}
              className="flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-950/10 border border-transparent transition-all"
            >
              <LogOut className="w-5 h-5" />
              <span>Sign Out Session</span>
            </button>
          </div>
        </div>
      )}

      {/* Desktop Sidebar Layout */}
      <aside className="hidden md:flex flex-col w-64 bg-zinc-950 border-r border-zinc-900 h-screen sticky top-0 p-5 flex-shrink-0 justify-between">
        <div className="space-y-8">
          {/* Logo brand */}
          <div className="flex items-center space-x-3 px-2 py-1">
            <div className="flex items-center justify-center">
              <img src="/crisisnexus-loader.svg" alt="CrisisNexus Logo" className="w-10 h-10 animate-pulse drop-shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-black text-slate-100 uppercase tracking-widest leading-none">CrisisNexus</span>
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mt-1">NGO Portal</span>
            </div>
          </div>

          {/* Nav links */}
          <nav className="flex flex-col space-y-1.5">
            {renderNavLinks()}
          </nav>
        </div>

        {/* User profile & Logout block */}
        <div className="border-t border-zinc-900 pt-5 space-y-4">
          <div className="flex items-center space-x-3 bg-zinc-900/40 border border-zinc-900/60 p-3 rounded-lg">
            <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700 shadow-inner flex-shrink-0">
              <UserIcon className="w-4 h-4 text-zinc-400" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-black text-slate-200 truncate">{formattedName}</span>
              {formattedContact && <span className="text-[9px] font-mono text-zinc-500 truncate mt-0.5">{formattedContact}</span>}
              <span className={`text-[9px] font-bold uppercase tracking-wider mt-1 ${
                formattedRole.includes("Logistics") ? "text-cyan-400" :
                formattedRole.includes("GIS") ? "text-indigo-400" :
                formattedRole.includes("Medical") ? "text-emerald-400" :
                formattedRole.includes("On-Site") ? "text-amber-400" :
                "text-red-400"
              }`}>{formattedRole}</span>
            </div>
          </div>

          <button
            onClick={() => logout()}
            className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-950/10 border border-transparent hover:border-red-900/20 transition-all duration-200"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            <span>Sign Out Session</span>
          </button>
        </div>
      </aside>
    </>
  );
};
