import { prisma } from "@/server/db/client";

export const dynamic = "force-dynamic";

export default async function AuditList() {
  const events = await prisma.auditEvent.findMany({
    take: 200,
    orderBy: { createdAt: "desc" },
    include: { actorUser: true },
  });

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Audit log</h1>
      <table className="min-w-full text-sm bg-white border">
        <thead className="bg-gray-100 text-left">
          <tr>
            <th className="px-3 py-2">When</th>
            <th className="px-3 py-2">Actor</th>
            <th className="px-3 py-2">Action</th>
            <th className="px-3 py-2">Entity</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id} className="border-t align-top">
              <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">
                {e.createdAt.toISOString().slice(0, 19)}
              </td>
              <td className="px-3 py-2 text-xs">{e.actorUser?.name ?? "system"}</td>
              <td className="px-3 py-2 text-xs font-mono">{e.action}</td>
              <td className="px-3 py-2 text-xs">
                <span className="text-gray-500">{e.entityType}</span>
                <div className="font-mono text-[11px]">{e.entityId}</div>
              </td>
            </tr>
          ))}
          {events.length === 0 && (
            <tr>
              <td colSpan={4} className="px-3 py-6 text-center text-gray-500 text-sm">
                No audit events yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
