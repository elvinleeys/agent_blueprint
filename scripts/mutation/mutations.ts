// 변이 실험 목록(구현 검사). 규칙의 판정 조건을 일부러 뒤집은 복사본에서 테스트가 실패해야 한다(실패 = 잡힘, 통과 = 살아남음).
// 각 변이: 어느 파일의 어느 줄을 어떻게 바꾸는지(find는 그 파일에서 정확히 한 번만 나와야 함)와 "이 변이는 어떤 잘못된 판정인가"(wrong).
// 단계 구분: 3a 설계 노드와 코드의 짝짓기 · 3b 구현 규칙과 결과 집계 · 3c 핵심 규칙과 근거 원칙(근거 없이 확정하지 않는다).

export type Edit = { find: string; replace: string };
export type Mutation = {
  id: string;
  stage: "3a" | "3b" | "3c";
  rule: string;
  file: string;
  edits: Edit[];
  /** 이 변이가 만드는 잘못된 판정 */
  wrong: string;
  /** 동등 변이(바꿔도 동작이 같아 테스트가 잡을 수 없음)면 그 근거. 살아남아도 실패로 세지 않는다 */
  equivalent?: string;
};

const m = (id: string, stage: Mutation["stage"], rule: string, file: string, find: string, replace: string, wrong: string): Mutation => ({ id, stage, rule, file, edits: [{ find, replace }], wrong });

const MATCH = "core/impl-check/match.ts";
const COMMON = "core/impl-check/rules/common.ts";
const RUN = "core/impl-check/run.ts";
const NEXT = "core/adapters/framework/impl-next.ts";
const REACT = "core/adapters/framework/impl-react.ts";
const FSD = "core/adapters/architecture/impl-fsd.ts";
const TW = "core/adapters/styling/impl-tailwind.ts";

export const MUTATIONS: Mutation[] = [
  // ── 3a: 짝짓기 ──
  m("A01", "3a", "짝: 대소문자 단계", MATCH, `  tier("case", (n, u) => u.name !== n.name && u.name.toLowerCase() === n.name.toLowerCase());`, ``, "대소문자만 다른 이름을 확실한 짝으로 보지 않음"),
  m("A02", "3a", "짝: 후보는 검사하지 않음", MATCH, `pairOf: (id) => pairs.get(id),`, `pairOf: (id) => pairs.get(id) ?? (reviews.get(id)?.candidates[0] ? { nodeId: id, nodeName: "", unit: reviews.get(id)!.candidates[0].unit, evidence: [] } : undefined),`, "후보(짝 확인 필요)를 확실한 짝처럼 이후 검사에 씀"),
  m("A03", "3a", "짝: 같은 이름은 위치로 특정", MATCH, `const byLocation = cands.filter((u) => dirMatches(u.fact.path, node.location.dir));`, `const byLocation: Unit[] = [];`, "같은 이름이 여러 개일 때 위치로 특정하지 않고 전부 확인 필요로 보냄"),
  m("A04", "3a", "짝: 같은 이름은 위치로 특정", MATCH, `if (byLocation.length === 1) {`, `if (byLocation.length >= 1) {`, "위치가 같은 코드가 여러 개여도 첫 번째로 확정"),
  m("A05", "3a", "짝: 이름 없는 기본 내보내기", MATCH, `u.fact.nameSource === "declared" && same(node, u.fact)`, `same(node, u.fact)`, "이름 없는 기본 내보내기를 파일 이름만으로 확실한 짝이라 확정"),
  m("A06", "3a", "짝: 종류(컴포넌트·훅)", MATCH, `const sameKind = (n: ComponentNode, u: UnitFact) => (n.kind === "hook") === (u.kind === "hook");`, `const sameKind = (n: ComponentNode, u: UnitFact) => true;`, "컴포넌트와 훅을 이름만 같으면 같은 것으로 짝지음"),
  m("A07", "3a", "짝: 읽지 못한 경로", MATCH, `if (!hit) continue;`, `continue;`, "경로에 노드 이름이 보이는 읽지 못한 파일이 있어도 확실한 짝을 그대로 둠"),
  {
    id: "A08",
    stage: "3a",
    rule: "짝: 같은 입력이면 같은 결과",
    file: MATCH,
    edits: [
      { find: `const files = [...model.files].sort((a, b) => byCodePoint(a.path, b.path));`, replace: `const files = [...model.files];` },
      { find: `    .sort((a, b) => byCodePoint(a.fact.path, b.fact.path) || byCodePoint(a.fact.name, b.fact.name));`, replace: `;` },
    ],
    wrong: "코드 단위를 입력 파일 순서대로 처리해, 파일 순서를 섞으면 결과가 달라짐",
  },
  m("A09", "3a", "짝: 후보 표시", MATCH, `...(holder && holder !== node.name ? { contestedBy: [holder] } : {})`, `...{}`, "한 코드를 두 노드가 후보로 다툴 때 진 노드에 다툰 상대를 알리지 않음"),
  m("A10", "3a", "짝: 화면 주소 근거", MATCH, `if (node.kind === "page" && route && `, `if (false && route && `, "화면 주소가 일치해도 후보 근거로 쓰지 않음"),
  m("A11", "3a", "짝: 코드에만 있음", MATCH, `!reviewCandidateKeys.has(u.key) && `, ``, "짝 확인 필요의 후보 코드를 '설계에 없는 컴포넌트'로도 보고함"),
  m("A12", "3a", "짝: 이름 유사도 기준값", "core/similarity/thresholds.ts", `export const NAME_JACCARD_MIN = 0.5;`, `export const NAME_JACCARD_MIN = 0.9;`, "이름 유사도 기준을 올려 비슷한 이름을 후보로 못 찾음"),

  // ── 3b: 구현 규칙과 결과 집계 ──
  m("B01", "3b", "IC-03 위치", COMMON, `const ok = dirMatches(unit.path, node.location.dir);`, `const ok = !dirMatches(unit.path, node.location.dir);`, "위치가 맞으면 경고, 틀리면 일치"),
  m("B02", "3b", "IC-07 이벤트", COMMON, `const has = unit.eventProps.includes(e) || attrs.has(e);`, `const has = unit.eventProps.includes(e) && attrs.has(e);`, "이벤트가 props와 JSX 속성 둘 다에 있어야 일치로 봄"),
  m("B03", "3b", "IC-08 서버 통신", COMMON, `  if (node.dataFetch) {`, `  if (!node.dataFetch) {`, "조회 담당과 아닌 노드의 판정을 맞바꿈"),
  m("B04", "3b", "IC-09 배치", TW, `if (states.some(([, s]) => s === "ABSENT")) return { status: "mismatch", notes };`, `if (states.some(([, s]) => s === "ALWAYS")) return { status: "mismatch", notes };`, "클래스가 있으면 불일치, 없으면 일치"),
  m("B05", "3b", "IC-10 토큰", TW, `const arbitrary = same.filter((c) => c.includes("["));`, `const arbitrary = same.filter((c) => !c.includes("["));`, "임의값(대괄호) 판정을 뒤집음"),
  m("B06", "3b", "IC-11 바깥 여백", TW, `const isOuterMargin = (c: string) => MARGIN.test(c) && c !== "mx-auto";`, `const isOuterMargin = (c: string) => MARGIN.test(c);`, "mx-auto(가운데 정렬)도 바깥 여백 위반으로 봄"),
  m("B07", "3b", "IC-12 인라인 style", COMMON, `const hit = unit.elements.filter((e) => e.inlineStyle);`, `const hit = unit.elements.filter((e) => !e.inlineStyle);`, "style이 없는 요소를 위반으로, 있는 요소를 준수로 봄"),
  m("B08", "3b", "ICN-02 server에 use client", NEXT, `else if (node.renderMode === "server" && file.useClient) {`, `else if (node.renderMode === "server" && !file.useClient) {`, "server 컴포넌트에 \"use client\"가 없을 때 위반으로 봄"),
  m("B09", "3b", "ICN-04 page.tsx", NEXT, `if (pageFile.units.length === 0) return`, `if (pageFile.units.length > 0) return`, "page.tsx가 화면을 직접 그리면 일치, 재내보내기만 하면 경고"),
  m("B10", "3b", "ICR-01 라우터 연결", REACT, `const linked = same.find(({ r }) => r.component === loc.unit.name);`, `const linked = same.find(({ r }) => r.component !== loc.unit.name);`, "화면 주소가 다른 컴포넌트에 연결돼 있으면 일치로 봄"),
  m("B11", "3b", "IC-02 코드에만 있음", RUN, `if (u.kind !== "component" || routeFiles.has(u.path)) continue;`, `if (u.kind !== "component") continue;`, "page.tsx 안의 컴포넌트도 '설계에 없는 컴포넌트'로 보고함"),
  m("B12", "3b", "집계: 일치 수", RUN, `match: count("match"),`, `match: count("match") + count("review"),`, "확인 필요 항목을 일치로 셈"),
  m("B13", "3b", "집계: 코드에 없는 노드", RUN, `for (const k of keys) ctx.mark(node.id, k, "mismatch", ["코드에 없음"], f.id);`, `for (const k of keys) ctx.mark(node.id, k, "review", ["코드에 없음"], f.id);`, "코드에 없는 노드의 항목을 불일치가 아니라 확인 필요로 표시"),
  m("B14", "3b", "집계: 금지 규칙", RUN, `ctx.markBan(node.id, k, "unknown", ["코드에 없는 노드라 확인할 수 없음"], f.id);`, `ctx.markBan(node.id, k, "ok", ["코드에 없는 노드라 확인할 수 없음"], f.id);`, "코드에 없는 노드의 금지 규칙을 준수로 표시"),
  m("B15", "3b", "집계: 정렬", RUN, `  items.sort((a, b) => byCodePoint(a.id, b.id));`, ``, "항목이 설계도의 노드 순서를 따라 나와 순서가 입력에 따라 달라짐"),
  m("B16", "3b", "집계: 카드 id", "core/impl-check/context.ts", "export const findingId = (rule: string, nodeId: string, key: string) => `${rule}|${nodeId}|${key}`;", "export const findingId = (rule: string, nodeId: string, key: string) => `${rule}|${key}`;", "카드 id에 노드가 빠져 서로 다른 노드의 카드 id가 같아짐"),
  m("B17", "3b", "집계: 항목 수", "core/impl-check/items.ts", `    ...(n.parentId ? ["parent"] : []),`, ``, "설계 준수 항목에서 부모-자식 항목을 빼 전체 수가 줄어듦"),

  // ── 3c: 핵심 규칙(스펙이 정한 것) ──
  m("C01", "3c", "IC-01 코드에 없음", RUN, `    ctx.add(f);\n    for (const k of keys) ctx.mark(node.id, k, "mismatch", ["코드에 없음"], f.id);`, `    for (const k of keys) ctx.mark(node.id, k, "mismatch", ["코드에 없음"], f.id);`, "코드에 없는 노드의 결과 카드를 내지 않음"),
  m("C02", "3c", "IC-04 부모-자식", COMMON, `if (r.kind === "yes") return ctx.mark(node.id, key, "match", ev);`, `if (r.kind === "no") return ctx.mark(node.id, key, "match", ev);`, "부모가 자식을 렌더링하지 않으면 일치, 하면 확인 필요로 봄"),
  m("C03", "3c", "IC-04 훅 호출", COMMON, `if (pu.hooks.some((h) => h.name === cu.name && (h.path === cu.path || (h.path === null && sameFile)))) return { kind: "yes" };`, `if (pu.rendered.some((h) => h.name === cu.name && (h.path === cu.path || (h.path === null && sameFile)))) return { kind: "yes" };`, "훅을 호출했는지가 아니라 렌더링했는지로 확인해 훅 사용 누락을 잘못 판정"),
  m("C04", "3c", "IC-06 props", COMMON, "for (const d of design.filter((p) => code.includes(p))) ctx.mark(node.id, `prop:${d}`, \"match\"", "for (const d of design.filter((p) => !code.includes(p))) ctx.mark(node.id, `prop:${d}`, \"match\"", "코드에 있는 설계 props를 일치가 아니라 없는 것을 일치로 봄"),
  m("C05", "3c", "IC-06 props", COMMON, `const IGNORED_PROPS = new Set(["children", "className", "key", "ref"]);`, `const IGNORED_PROPS = new Set<string>([]);`, "children·className 같은 공통 props를 '설계에 없는 props'로 보고함"),
  m("C06", "3c", "ICN-01 client", NEXT, `if (node.renderMode === "client" && !file.useClient) {`, `if (node.renderMode === "client" && file.useClient) {`, "\"use client\"가 있는 client 컴포넌트를 위반, 없는 것을 일치로 봄"),
  m("C07", "3c", "ICN-01 심각도", NEXT, `const card = f("ICN-01", withFeatures ? "error" : "warning",`, `const card = f("ICN-01", withFeatures ? "warning" : "error",`, "상태·이벤트를 쓰는 경우를 경고, 안 쓰는 경우를 오류로 맞바꿈"),
  m("C08", "3c", "ICN-03 타입 import", NEXT, `(i) => !i.typeOnly && i.resolved && serverFiles.has`, `(i) => i.typeOnly && i.resolved && serverFiles.has`, "타입만 가져오는 import를 위반으로 보고 값을 가져오는 것은 놓침"),
  m("C09", "3c", "ICN-03 client 파일만", NEXT, `    if (file.useClient) {`, `    if (!file.useClient) {`, "client가 아닌 파일의 import를 검사"),
  m("C10", "3c", "ICF-01 계층 방향", FSD, `const up = LAYERS.indexOf(to.layer) < LAYERS.indexOf(from.layer);`, `const up = LAYERS.indexOf(to.layer) > LAYERS.indexOf(from.layer);`, "위 계층을 가져오는 것은 허용, 아래 계층을 가져오는 것을 위반으로 봄"),
  m("C11", "3c", "ICF-01 슬라이스", FSD, `to.slice !== from.slice;`, `to.slice === from.slice;`, "같은 슬라이스 안 import를 위반, 다른 슬라이스 import를 허용으로 봄"),
  {
    ...m("C12", "3c", "ICF-01 app 계층", FSD, `if (!from || from.layer === "app") continue;`, `if (!from) continue;`, "app 계층도 검사 대상에 넣음"),
    equivalent:
      "app은 계층 순서(app, pages, widgets, features, entities, shared)의 맨 위(0번)라 'to 계층이 from보다 위'(indexOf(to) < 0)가 성립할 수 없고, 슬라이스가 없는 계층(SLICED에 없음)이라 '다른 슬라이스' 비교도 성립하지 않는다. 제외 줄이 없어도 app에서는 위반이 나오지 않아 결과가 같다.",
  },

  // ── 3c: 근거 원칙(분석기가 확인하지 못한 것을 확정하지 않는다) ──
  m("E01", "3c", "근거 원칙: import 해석", COMMON, `if (unresolved && used) return { kind: "import", via: unresolved.spec };`, `if (unresolved && used) return { kind: "no" };`, "경로를 풀지 못한 import가 있는데 부모-자식 관계를 불일치로 확정"),
  {
    id: "E02a",
    stage: "3c",
    rule: "근거 원칙: 서버 통신 유형",
    file: COMMON,
    edits: [{ find: `if (sum && sum !== "UNKNOWN") return ctx.mark(node.id, key, "match", ev);`, replace: `if (sum) return ctx.mark(node.id, key, "match", ev);` }],
    wrong: "유형을 알 수 없는(UNKNOWN) 서버 통신을 조회 담당의 근거(일치)로 확정",
  },
  m("E02b", "3c", "근거 원칙: 서버 통신 유형", COMMON, `  if (!sum) return ctx.mark(node.id, key, "match", ev);\n  if (sum === "UNKNOWN") {`, `  if (!sum) return ctx.mark(node.id, key, "match", ev);\n  if (false) {`, "유형을 알 수 없는(UNKNOWN) 서버 통신을 '조회 안 맡는 노드의 위반'으로 확정"),
  m("E03a", "3c", "근거 원칙: 조건부 클래스", "core/code-model/facts.ts", `if (info?.conditional.includes(cls)) return "CONDITIONAL";`, `if (info?.conditional.includes(cls)) return "ALWAYS";`, "조건부로만 붙는 클래스를 항상 있다고 확정"),
  m("E03b", "3c", "근거 원칙: 조건부 클래스", "core/code-model/facts.ts", `if (info?.conditional.includes(cls)) return "CONDITIONAL";`, `if (info?.conditional.includes(cls)) return "ABSENT";`, "조건부로만 붙는 클래스를 없다고 확정"),
  m("E03c", "3c", "근거 원칙: 읽지 못한 클래스", "core/code-model/facts.ts", `  if (info?.dynamic) return "DYNAMIC";\n`, ``, "읽지 못한 클래스 값(DYNAMIC)을 없다고(ABSENT) 확정"),
  m("E04", "3c", "근거 원칙: 알 수 없는 import 경로", MATCH, `if (scope.unknownTarget) {`, `if (false) {`, "경로를 알 수 없는 변수 import가 있는데도 짝 없는 노드를 코드에 없다고 확정"),
  {
    id: "E05a",
    stage: "3c",
    rule: "근거 원칙: 두 단계 훅 안의 상태",
    file: COMMON,
    edits: [
      { find: `    if (hook) {`, replace: `    if (hook || nested) {` },
      { find: "ctx.mark(node.id, key, \"match\", [`${at(hook.unit.path, hook.unit.line)} 상태 ${s}은(는) 훅 ${hook.unit.name} 안에서", replace: "ctx.mark(node.id, key, \"match\", [`${at((hook ?? nested!.inner).unit.path, 1)} 상태 ${s}은(는) 훅 ${(hook ?? nested!.inner).unit.name} 안에서" },
    ],
    wrong: "훅이 다시 다른 훅을 불러 그 안에 있는 상태(두 단계)를 근거 없이 이 컴포넌트의 상태로 인정",
  },
  m("E05b", "3c", "근거 원칙: Context·외부 상태", COMMON, `ctx.mark(node.id, key, "review", evx, f.id);`, `ctx.mark(node.id, key, "match", evx, f.id);`, "Context·상태 관리 라이브러리 훅을 쓰면 설계의 상태가 있다고 근거 없이 인정"),
  m("E06", "3c", "근거 원칙: 부모 짝이 후보", COMMON, "return ctx.mark(node.id, key, \"review\", [`부모 ", "return ctx.mark(node.id, key, \"match\", [`부모 ", "부모 노드의 짝이 후보(확정 아님)인데 자식의 부모-자식 항목을 일치로 판정"),
];
