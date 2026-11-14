// 데이터 요청으로 보는 호출 목록과 유형 분류표. 구현 검사의 "서버 통신"(dataFetch) 판정이 이 파일만 쓴다. 새 라이브러리는 여기만 고친다.

/** READ = 조회, WRITE = 변경, UNKNOWN = 코드만으로 판별 불가 */
export type FetchKind = "READ" | "WRITE" | "UNKNOWN";

/** fetch처럼 `(주소, 옵션)`을 받는 호출. 옵션의 method로 유형을 가른다(없으면 GET = READ) */
export const FETCH_CLIENT_FUNCTIONS = new Set(["fetch", "$fetch", "ofetch", "ky", "got"]);
/** axios처럼 `(설정)` 또는 `(주소, 설정)`을 받는 호출. 설정의 method로 유형을 가른다(없으면 GET = READ) */
export const FETCH_CONFIG_FUNCTIONS = new Set(["axios"]);

/** 조회 훅은 READ, 변경 훅은 WRITE */
export const READ_HOOKS = new Set(["useQuery", "useInfiniteQuery", "useSuspenseQuery", "useLazyQuery", "useSWR", "useSWRImmutable", "useSWRInfinite"]);
export const WRITE_HOOKS = new Set(["useMutation"]);

/** `axios.get(...)`처럼 객체의 메서드로 호출하는 것: 객체 이름 → 요청 메서드 */
export const FETCH_METHODS: Record<string, ReadonlySet<string>> = {
  axios: new Set(["get", "post", "put", "patch", "delete", "request", "head"]),
  ky: new Set(["get", "post", "put", "patch", "delete", "head"]),
  got: new Set(["get", "post", "put", "patch", "delete", "head"]),
};

/** HTTP 메서드 이름 → 유형. 목록에 없는 메서드는 UNKNOWN */
export const METHOD_KIND: Record<string, FetchKind> = { get: "READ", head: "READ", options: "READ", post: "WRITE", put: "WRITE", patch: "WRITE", delete: "WRITE" };

/** 호출 체인의 시작 이름이 이 모양이면 `.from(...)`·`.rpc(...)`를 조회 호출로 본다: `supabase.from("t").select()` */
export const QUERY_CLIENT_NAME = /supabase/i;
export const QUERY_CLIENT_METHODS = new Set(["from", "rpc"]);
/** `.from(...)` 뒤에 이어지는 체인에서 처음 만나는 이 메서드가 유형을 정한다. 없으면 UNKNOWN(`.rpc`는 항상 UNKNOWN) */
export const SUPABASE_READ = new Set(["select"]);
export const SUPABASE_WRITE = new Set(["insert", "update", "upsert", "delete"]);

/** `use(promise)`는 Context를 읽는 데도 쓰이므로 인자가 호출식이거나 이름이 Context로 끝나지 않는 식별자일 때만 조회 호출로 본다. 유형은 UNKNOWN */
export const USE_FUNCTION = "use";
