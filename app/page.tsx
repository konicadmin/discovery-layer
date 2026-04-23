import Link from "next/link";

export default function Home() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">Discovery Layer</h1>
      <p className="mt-2 text-sm text-gray-600">
        B2B procurement platform. Entry points:
      </p>
      <ul className="mt-2 text-sm list-disc pl-6 space-y-1">
        <li>
          <Link className="underline" href="/admin">
            /admin
          </Link>{" "}
          — ops console
        </li>
        <li>
          <Link className="underline" href="/buyer">
            /buyer
          </Link>{" "}
          — buyer sourcing (Phase 3)
        </li>
        <li>
          <Link className="underline" href="/vendor/claim">
            /vendor/claim
          </Link>{" "}
          — vendor claim acceptance (Phase 2)
        </li>
      </ul>
    </main>
  );
}
