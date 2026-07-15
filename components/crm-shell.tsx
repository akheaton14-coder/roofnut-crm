"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const links = [
  ["Command center", "/", "⌂"], ["Clients", "/clients", "◎"], ["Jobs", "/jobs", "▣"],
  ["Calendar", "#", "□"], ["Tasks", "#", "✓"], ["Pipeline", "#", "↗"],
  ["Estimates", "#", "$"], ["Production", "#", "◇"], ["Payments", "#", "◫"],
];

export function CrmShell({ children, userName }: { children: React.ReactNode; userName: string }) {
  const pathname = usePathname(); const router = useRouter();
  async function signOut() { await createClient().auth.signOut(); router.replace("/login"); }
  return <main className="app-shell"><aside className="sidebar"><div className="brand"><span className="brand-mark">R</span><span>ROOFNUT <b>CRM</b></span></div><nav>{links.map((link, i) => <div key={link[0]}>{i === 0 && <p className="nav-label">WORKSPACE</p>}{i === 5 && <p className="nav-label">REVENUE</p>}<Link href={link[1]} className={pathname === link[1] || (link[1] !== "/" && pathname.startsWith(link[1])) ? "active" : ""}><span className="nav-icon">{link[2]}</span>{link[0]}</Link></div>)}</nav><div className="ai-card"><span className="spark">✦</span><div><b>Roofnut AI</b><p>Ask anything about your business</p></div><button>→</button></div><div className="user-card"><span>{userName.split(" ").map(p=>p[0]).join("").slice(0,2).toUpperCase()}</span><div><b>{userName}</b><p>Administrator</p></div><button onClick={signOut}>↪</button></div></aside><section className="workspace"><header><div className="search"><span>⌕</span><input placeholder="Search clients, jobs, addresses..."/><kbd>⌘ K</kbd></div><button className="icon-button">♢</button><Link className="primary-button header-link" href="/">＋ New job</Link></header>{children}</section></main>;
}
