import { NextResponse } from "next/server";
import { getUserSession, USER_COOKIE_NAME } from "@/lib/auth";

export async function GET() {
  const user = await getUserSession();
  return NextResponse.json({ status: "success", data: { user } });
}

export async function POST() {
  const res = NextResponse.json({ status: "success" });
  res.cookies.delete(USER_COOKIE_NAME);
  return res;
}
