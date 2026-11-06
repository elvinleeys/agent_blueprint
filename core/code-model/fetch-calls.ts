// 데이터 요청으로 보는 호출 목록. 구현 검사의 "조회 담당"(dataFetch) 판정이 이 목록만 쓴다. 새 라이브러리는 여기만 고친다.

/** 이름만으로 호출하는 것: `fetch(...)`, `useQuery(...)` */
export const FETCH_FUNCTIONS = new Set(["fetch", "$fetch", "ofetch", "axios", "ky", "got", "useQuery", "useInfiniteQuery", "useSuspenseQuery", "useMutation", "useSWR", "useSWRImmutable", "useSWRInfinite", "useLazyQuery"]);

/** `axios.get(...)`처럼 객체의 메서드로 호출하는 것: 객체 이름 → 요청 메서드 */
export const FETCH_METHODS: Record<string, ReadonlySet<string>> = {
  axios: new Set(["get", "post", "put", "patch", "delete", "request", "head"]),
  ky: new Set(["get", "post", "put", "patch", "delete", "head"]),
  got: new Set(["get", "post", "put", "patch", "delete", "head"]),
};

/** 호출 체인의 시작 이름이 이 모양이면 `.from(...)`·`.rpc(...)`를 조회로 본다: `supabase.from("t").select()` */
export const QUERY_CLIENT_NAME = /supabase/i;
export const QUERY_CLIENT_METHODS = new Set(["from", "rpc"]);

/** `use(promise)`는 Context를 읽는 데도 쓰이므로 인자가 호출식이거나 이름이 Context로 끝나지 않는 식별자일 때만 조회로 본다 */
export const USE_FUNCTION = "use";
