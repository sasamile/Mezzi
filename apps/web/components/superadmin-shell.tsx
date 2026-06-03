"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, ReactNode, useState, useRef } from "react";
import {
  LayoutDashboard,
  Building2,
  BadgeDollarSign,
  Users,
  LogOut,
} from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex";
import { useAuth } from "@/lib/auth-context";
import { allowsSuperadminPanel } from "@/lib/saas-host-access";
import Image from "next/image";

interface SuperadminShellProps {
  children: ReactNode;
}


export function SuperadminShell({ children }: SuperadminShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading, logout } = useAuth();
  const tenants = useQuery(api.tenants.listWithPlans);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isLoading) return;
    const host =
      typeof window !== "undefined" ? window.location.hostname : "";
    if (!allowsSuperadminPanel(host)) {
      router.replace("/tenants");
      return;
    }
    if (!user || !user.isSuperadmin) {
      router.replace("/login");
    }
  }, [user, isLoading, router]);

  // Cerrar el dropdown al hacer click fuera
  useEffect(() => {
    if (!isUserMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (userMenuRef.current && target && !userMenuRef.current.contains(target)) {
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isUserMenuOpen]);

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  if (isLoading || !user?.isSuperadmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="rounded-2xl bg-slate-900 px-4 py-2 text-sm text-slate-300 shadow-lg shadow-black/40">
          Cargando panel...
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden justify-center bg-linear-to-b to-red-50 from-white text-slate-900 px-3 py-4 md:px-6">
      <div className="mx-auto flex min-h-0 w-full max-w-full flex-1 gap-4">
        {/* Rail lateral: altura fija del viewport, sin scroll */}
        <aside className="hidden h-full w-16 shrink-0 flex-col items-center justify-between rounded-3xl bg-white/50 p-3 shadow-[0_18px_60px_rgba(15,23,42,0.18)] backdrop-blur-xs md:flex z-40">
          <Link
            href="/superadmin"
            className="flex h-10 w-10 items-center justify-center rounded-sm text-lg font-semibold text-white  "
          >
            <Image
              src={"/logos/mezzi.icon.svg"}
              alt="Logo"
              width={100}
              height={100}
            />
          </Link>

          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-slate-400">
            {[
              { href: "/superadmin", icon: LayoutDashboard },
              { href: "/superadmin/restaurantes", icon: Building2 },
              { href: "/superadmin/planes", icon: BadgeDollarSign },
              { href: "/superadmin/usuarios-superadmin", icon: Users },
            ].map(({ href, icon: Icon }) => {
              const active =
                pathname === href ||
                (href !== "/superadmin" && pathname.startsWith(href));

              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-xs transition ${
                    active
                      ? "bg-red-600 text-white shadow-lg shadow-red-500/40"
                      : "bg-white text-red-600 hover:bg-red-100 hover:text-red-600"
                  }`}
                  aria-label={href}
                >
                  <Icon className="h-4 w-4" />
                </Link>
              );
            })}
          </div>

          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setIsUserMenuOpen((open) => !open)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-red-600 transition-colors hover:bg-red-100 hover:text-red-600"
              aria-label="Menú de usuario"
            >
              <span className="text-sm font-semibold">
                {user.name?.[0]?.toUpperCase() ?? "S"}
              </span>
            </button>

            {isUserMenuOpen && (
              <div className="absolute bottom-12 left-0 z-200 w-48 rounded-2xl bg-white/95 p-3 text-xs text-slate-700 shadow-xl ring-1 ring-slate-200 backdrop-blur-md">
                <div className="mb-2 border-b border-slate-100 pb-2">
                  <p className="truncate text-[11px] font-semibold">
                    {user.name ?? "Superadmin"}
                  </p>
                  <p className="truncate text-[10px] text-slate-400">
                    {user.email}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-[11px] text-red-600 hover:bg-red-50"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Cerrar sesión</span>
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* Panel principal: no crece más que el viewport, scroll solo dentro del main */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-white/25 bg-white/10 opacity-90 shadow-[0_24px_80px_rgba(15,23,42,0.3)] backdrop-blur-2xl">
          {/* Contenido: scroll solo en esta zona, sidebar y main no crecen */}
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-linear-to-b from-slate-50/80 via-white/80 to-slate-50/80 px-4 py-4 md:px-6 md:py-6">
            <div className="flex min-h-0 flex-1 flex-col gap-4">
              <section className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-3xl w-full bg-white/80 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.12)] ring-1 ring-slate-200 backdrop-blur">
                {children}
              </section>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
