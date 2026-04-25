import Link from "next/link";

const NAV: Array<{ href: string; label: string }> = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/vendors", label: "Vendors" },
  { href: "/admin/verification", label: "Verification queue" },
  { href: "/admin/discovery", label: "Discovery" },
  { href: "/admin/pricing", label: "Pricing queue" },
  { href: "/admin/requirements", label: "Requirements" },
  { href: "/admin/rfqs", label: "RFQs" },
  { href: "/admin/audit", label: "Audit" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex bg-gray-50 text-gray-900">
      <aside className="w-56 border-r bg-white">
        <div className="p-4 border-b">
          <div className="text-sm font-semibold">Discovery Layer</div>
          <div className="text-xs text-gray-500">Ops console</div>
        </div>
        <nav className="p-2 space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-3 py-1.5 text-sm rounded hover:bg-gray-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
