import type { SupabaseClient } from "@supabase/supabase-js";

type Result = { data?: unknown; error?: { code?: string; name?: string } | null };

/** 테스트용 가짜 클라이언트. 체인 호출을 기록하고, await할 때마다 준비한 결과를 차례로 돌려준다 */
export function fakeDb(...results: Result[]) {
  const calls: unknown[][] = [];
  const queue = [...results];
  const chain: object = new Proxy(
    {},
    {
      get: (_, prop) => {
        if (prop === "then") {
          const next = queue.shift() ?? { data: null, error: null };
          return (resolve: (r: Result) => void) => resolve({ data: null, error: null, ...next });
        }
        return (...args: unknown[]) => {
          calls.push([prop, ...args]);
          return chain;
        };
      },
    },
  );
  const db = { from: (table: string) => (calls.push(["from", table]), chain) } as unknown as SupabaseClient;
  return { db, calls };
}
