import LoginButton from "../auth/LoginButton";

type Params = Promise<{ next?: string | string[]; error?: string | string[] }>;

// searchParams는 요청 시점 데이터라 호출하는 쪽에서 Suspense로 감싼다
export default async function HomeLogin({ searchParams }: { searchParams: Params }) {
  const { next, error } = await searchParams;
  return (
    <div className="flex flex-col items-center gap-4">
      {error === "auth" && <p role="alert" className="text-red-600">로그인에 실패했습니다. 다시 시도해 주세요.</p>}
      <LoginButton next={typeof next === "string" ? next : undefined} />
    </div>
  );
}
