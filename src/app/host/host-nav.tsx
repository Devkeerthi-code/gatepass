"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icon";

const MAIN: { href: string; label: string; icon: IconName }[] = [
  { href: "/host", label: "Concerts", icon: "music" },
  { href: "/host/settings/payments", label: "Payments", icon: "card" },
  { href: "/host/settings/team", label: "Team", icon: "users" },
  { href: "/scan", label: "Gate scanner", icon: "scan" },
];

const EVENT: { seg: string; label: string; icon: IconName }[] = [
  { seg: "", label: "Overview", icon: "grid" },
  { seg: "/edit", label: "Concert page", icon: "image" },
  { seg: "/tickets", label: "Tickets", icon: "ticket" },
  { seg: "/promos", label: "Promotions", icon: "gift" },
  { seg: "/attendees", label: "Attendees", icon: "users" },
];

function useEventBase(): string | null {
  const path = usePathname();
  const match = path.match(/^\/host\/events\/([^/]+)/);
  return match && match[1] !== "new" ? `/host/events/${match[1]}` : null;
}

function isCurrent(path: string, href: string): boolean {
  if (href === "/host") return path === "/host";
  return path === href;
}

export function HostNav() {
  const path = usePathname();
  const base = useEventBase();
  return (
    <nav className="nav" aria-label="Main">
      {MAIN.map((item) => (
        <Link key={item.href} href={item.href} aria-current={isCurrent(path, item.href) ? "page" : undefined}>
          <Icon name={item.icon} />
          {item.label}
        </Link>
      ))}
      {base ? (
        <>
          <div className="sep">This concert</div>
          {EVENT.map((item) => {
            const href = `${base}${item.seg}`;
            return (
              <Link key={href} href={href} aria-current={path === href ? "page" : undefined}>
                <Icon name={item.icon} />
                {item.label}
              </Link>
            );
          })}
        </>
      ) : null}
    </nav>
  );
}

export function MobileTabs() {
  const path = usePathname();
  const base = useEventBase();
  const items = base
    ? [{ href: "/host", label: "← Concerts" }, ...EVENT.map((e) => ({ href: `${base}${e.seg}`, label: e.label }))]
    : MAIN.map((m) => ({ href: m.href, label: m.label }));
  return (
    <nav className="mtabs" aria-label="Sections">
      {items.map((item) => (
        <Link key={item.href} href={item.href} aria-current={path === item.href ? "page" : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
