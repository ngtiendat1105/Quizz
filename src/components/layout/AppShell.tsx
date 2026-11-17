"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Clock3, FileQuestion, FileUp, HelpCircle, LayoutDashboard, Settings2, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/questions", label: "Ngân hàng câu hỏi", icon: BookOpen },
  { href: "/history", label: "Lịch sử làm bài", icon: Clock3 },
  { href: "/quiz/create", label: "Tạo bài Quiz", icon: FileQuestion },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <div className="min-h-screen md:flex">
    <aside className="w-full border-b border-slate-200 bg-white md:fixed md:inset-y-0 md:w-64 md:border-b-0 md:border-r">
      <div className="flex h-full flex-col px-5 py-6">
        <Link href="/" className="mb-10 flex items-center gap-3 px-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-200"><Sparkles size={19} /></span>
          <span><span className="block text-base font-bold tracking-tight text-slate-900">Quiz Platform</span><span className="text-xs text-slate-500">Study smarter</span></span>
        </Link>
        <nav className="flex gap-1 overflow-x-auto md:block md:space-y-1">
          {nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={cn("flex min-w-max items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition", pathname === href ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900")}><Icon size={18} />{label}</Link>)}
        </nav>
        <div className="mt-6 border-t border-slate-100 pt-5 md:mt-auto">
          <Link href="/import" className="mb-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-50"><FileUp size={18} />Import PDF</Link>
          <Link href="/settings" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-50"><Settings2 size={18} />Cài đặt</Link>
        </div>
        <div className="mt-5 hidden rounded-2xl bg-slate-900 p-4 text-white md:block"><HelpCircle size={18} className="mb-3 text-blue-300" /><p className="text-sm font-semibold">Bắt đầu ôn tập</p><p className="mt-1 text-xs leading-5 text-slate-300">Import PDF để tạo ngân hàng câu hỏi đầu tiên.</p><Link href="/import" className="mt-3 block rounded-lg bg-white px-3 py-2 text-center text-xs font-semibold text-slate-900">Import ngay</Link></div>
      </div>
    </aside>
    <main className="min-h-screen w-full md:ml-64">{children}</main>
  </div>;
}
