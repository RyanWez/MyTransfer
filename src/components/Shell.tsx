"use client";

import * as React from "react";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import { CommandPalette } from "@/components/CommandPalette";
import NotificationBridge from "@/components/NotificationBridge";

/** Holds the mobile drawer state shared by the rail and the top bar. */
export default function Shell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <div className="flex min-h-screen">
      <Sidebar 
        open={menuOpen} 
        onClose={() => setMenuOpen(false)} 
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onMenu={() => setMenuOpen(true)} />
        <main className="flex-1 px-5 py-6 md:px-8 md:py-8">{children}</main>
      </div>
      {/* App-wide ⌘K launcher; portal-renders above everything. */}
      <CommandPalette />
      {/* Turns background SSE transfer results into OS notifications. */}
      <NotificationBridge />
    </div>
  );
}
