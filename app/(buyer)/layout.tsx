import Link from "next/link";

export default function BuyerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/buyer" className="text-sm font-semibold">
            Discovery Layer · Buyer
          </Link>
          <nav className="text-sm flex gap-4">
            <Link href="/buyer" className="hover:underline">
              Requirements
            </Link>
            <Link href="/buyer/new" className="hover:underline">
              New
            </Link>
          </nav>
        </div>
      </header>
      <main className="max-w-5xl mx-auto p-4">{children}</main>
    </div>
  );
}
