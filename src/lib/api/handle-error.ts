import { NextResponse } from "next/server";
import { DomainError } from "@/lib/errors";

export function errorResponse(err: unknown) {
  if (err instanceof DomainError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
  }
  console.error(err);
  return NextResponse.json({ error: "internal_error" }, { status: 500 });
}
