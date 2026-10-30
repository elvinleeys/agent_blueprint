import { redirect } from "next/navigation";
import { Suspense } from "react";

// 로그인은 홈이 맡는다. 보통은 proxy.ts가 먼저 이동시키고, 여기는 같은 이동을 하는 안전망이다
type Params = Promise<{ next?: string | string[]; error?: string | string[] }>;

async function GoHome({ searchParams }: { searchParams: Params }): Promise<never> {
  const { next, error } = await searchParams;
  const query = new URLSearchParams();
  if (typeof next === "string") query.set("next", next);
  if (typeof error === "string") query.set("error", error);
  const qs = query.toString();
  redirect(qs ? `/?${qs}` : "/");
}

export default function LoginPage({ searchParams }: { searchParams: Params }) {
  return (
    <Suspense fallback={null}>
      <GoHome searchParams={searchParams} />
    </Suspense>
  );
}
