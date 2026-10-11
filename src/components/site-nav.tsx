"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Matches" },
  { href: "/track-record", label: "Track record" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/match");
  return pathname.startsWith(href);
}

function Icon({ href }: { href: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-6 h-6"
      aria-hidden="true"
    >
      {href === "/" ? (
        <>
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M8 2v4M16 2v4M3 10h18" />
        </>
      ) : (
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      )}
    </svg>
  );
}

export function TopNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden md:block border-b border-gray-800 bg-gray-950">
      <div className="max-w-6xl mx-auto px-4 flex justify-end gap-6 text-sm">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`py-3 border-b-2 transition ${
              isActive(pathname, tab.href)
                ? "border-blue-500 text-white"
                : "border-transparent text-gray-400 hover:text-white"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 inset-x-0 z-20 border-t border-gray-800 bg-gray-950/95 backdrop-blur md:hidden pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-2">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab.href);

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center justify-center gap-1 min-h-14 text-xs transition ${
                active ? "text-blue-400" : "text-gray-500 active:text-gray-300"
              }`}
            >
              <Icon href={tab.href} />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}