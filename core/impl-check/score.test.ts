import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildTar, paxRecord } from "@/lib/code-source/tar-builder";
import { banSummaryText, designSummaryText } from "@/components/implementation-check/result-view";
import { readCodeModel } from "@/core/code-model/facts";
import { filterFiles } from "@/core/code-model/filter-files";
import { configSummary } from "@/core/impl-check/config-summary";
import { checkImplementation } from "@/core/impl-check/run";
import { LOCAL_LIMITS, scoreImplementation, scoreJson, scoreText, type ScoreReport } from "@/core/impl-check/score";
import { selectByBlueprint } from "@/core/impl-check/select-files";
import { BlueprintSchema } from "@/core/schema/blueprint";
import { runScore } from "../../scripts/score";
import { readLocalFolder } from "@/lib/code-source/local";

// 채점 스크립트(npm run score): 시연 세트(fixtures/demo-implementation-check)에서 화면 결과와 같은 숫자를 내는지,
// 설계도 위치 기준 읽기가 필요한 파일만 고르는지, 내 컴퓨터용 상한과 옵션이 동작하는지.

const BLUEPRINT_FILE = "fixtures/implementation-check/next/blueprint.json";
const DEMO = "fixtures/demo-implementation-check";
const bp = BlueprintSchema.parse(JSON.parse(readFileSync(BLUEPRINT_FILE, "utf8")));
const report = (o: ReturnType<typeof scoreImplementation>): ScoreReport => {
  if (!o.ok) throw new Error(o.message);
  return o.report;
};

/** 화면 결과: 서버 처리(implementation-check-handler)와 같은 순서로 폴더 전체를 거르고 검사한 값 */
function screen(name: string) {
  const files = filterFiles(readLocalFolder(`${DEMO}/${name}`).map((f) => ({ ...f, size: f.content.length })), { allowConfigFiles: true }).accepted.map(({ path, content }) => ({ path, content }));
  const model = readCodeModel(files);
  const r = checkImplementation(bp, model);
  return { files: files.length, configs: configSummary(files, model), summary: r.summary, certain: r.findings.filter((f) => f.certainty === "certain" && !f.outsideDesign).length, review: r.findings.filter((f) => f.certainty === "review").length };
}

describe("시연 세트: 위치 기준·전체 읽기 모두 화면 결과와 같은 숫자", () => {
  const known = {
    correct: { design: { total: 65, match: 65, mismatch: 0, review: 0 }, ban: { violated: 0, unknown: 0 }, cards: { certain: 0, review: 0 } },
    renamed: { design: { total: 65, match: 56, mismatch: 0, review: 9 }, ban: { violated: 0, unknown: 2 }, cards: { certain: 0, review: 3 } },
    warning: { design: { total: 65, match: 64, mismatch: 1, review: 0 }, ban: { violated: 2, unknown: 0 }, cards: { certain: 3, review: 0 } },
  };

  it.each(Object.entries(known))("%s", (name, want) => {
    const files = readLocalFolder(`${DEMO}/${name}`);
    const s = screen(name);
    for (const mode of ["blueprint-locations", "all"] as const) {
      const r = report(scoreImplementation(bp, files, mode));
      expect(r.mode).toBe(mode);
      expect({ design: r.design, ban: r.ban, cards: r.cards }).toEqual(want);
      expect(r.design).toEqual(s.summary.design);
      expect(r.ban).toEqual(s.summary.ban);
      expect(r.outsideDesign.count).toBe(s.summary.outsideDesign);
      expect(r.cards).toEqual({ certain: s.certain, review: s.review });
      expect(r.configs).toEqual(s.configs);
      expect(r.files).toBe(s.files);
      // 텍스트 출력의 집계 문구는 화면 문구와 같은 형식
      const text = scoreText(r, name);
      expect(text).toContain(designSummaryText(s.summary));
      expect(banSummaryText(s.summary)).toContain(text.split("\n").find((l) => l.startsWith("금지 규칙"))!.replace(/^금지 규칙\s+/, ""));
    }
  });
});

describe("설계도 위치 기준으로 고르기", () => {
  const withSize = (files: { path: string; content: string }[]) => files.map((f) => ({ ...f, size: f.content.length }));

  it("관계없는 화면 파일은 고르지 않는다(전체 읽기에는 들어간다)", () => {
    const files = [...readLocalFolder(`${DEMO}/correct`), { path: "correct/src/pages/other/ui/OtherPage.tsx", content: "export function OtherPage() { return <div />; }" }];
    const loc = report(scoreImplementation(bp, files));
    const all = report(scoreImplementation(bp, files, "all"));
    expect(loc.files).toBe(11);
    expect(loc.scanned).toBe(12);
    expect(all.files).toBe(12);
    expect(loc.design).toEqual(all.design);
  });

  it("설계 위치가 아닌 곳의 파일도 import를 따라 읽는다(warning: src/shared/ui/AddToCartButton → 위치 다름 IC-03, 코드에 없음이 아님)", () => {
    const picked = selectByBlueprint(bp, withSize(readLocalFolder(`${DEMO}/warning`))).map((f) => f.path);
    expect(picked).toContain("warning/src/shared/ui/AddToCartButton.tsx");
    expect(picked).toContain("warning/src/entities/product/model/types.ts"); // 위치 파일이 가져오는 타입 파일
    expect(picked).toContain("warning/tsconfig.json");
  });

  it("화면 진입 파일(노드 위치 파일을 직접 가져오는 파일)은 읽되, 진입 파일이 가져오는 것은 따라가지 않는다", () => {
    const files = withSize([
      ...readLocalFolder(`${DEMO}/correct`),
      { path: "correct/src/app/router.tsx", content: 'import { ProductDetailPage } from "@/pages/product-detail/ui/ProductDetailPage";\nimport { OtherPage } from "@/pages/other/ui/OtherPage";\nexport const routes = [ProductDetailPage, OtherPage];' },
      { path: "correct/src/pages/other/ui/OtherPage.tsx", content: "export function OtherPage() { return <div />; }" },
    ]);
    const picked = selectByBlueprint(bp, files).map((f) => f.path);
    expect(picked).toContain("correct/app/products/[id]/page.tsx");
    expect(picked).toContain("correct/src/app/router.tsx");
    expect(picked).not.toContain("correct/src/pages/other/ui/OtherPage.tsx");
  });
});

describe("React Router: 라우터 설정 파일을 화면 진입 파일로 고른다 (fixtures/score/react-router)", () => {
  // 승인된 시험 데이터 fixtures/implementation-check/react/correct를 복사하고, 설계도에 없는 설정 화면(src/screens/settings)을 라우터에만 연결했다
  const rbp = BlueprintSchema.parse(JSON.parse(readFileSync("fixtures/score/react-router-blueprint.json", "utf8")));
  const files = readLocalFolder("fixtures/score/react-router");
  const withSize = files.map((f) => ({ ...f, size: f.content.length }));

  it("노드 위치(pages·components·hooks) 밖의 src/router.tsx를 읽고, 라우터가 가져오는 설정 화면은 따라가지 않는다", () => {
    const picked = selectByBlueprint(rbp, withSize).map((f) => f.path);
    expect(picked).toContain("react-router/src/router.tsx");
    expect(picked).toContain("react-router/src/types.ts");
    expect(picked).not.toContain("react-router/src/screens/settings/SettingsPage.tsx");
    expect(picked).not.toContain("react-router/src/screens/settings/SettingsForm.tsx");
  });

  it("위치 기준: 59개 모두 일치(라우터가 화면 주소를 맡음), 설계 밖 0건 / 전체: 같은 집계에 설계 밖 2건(경로 포함)", () => {
    const loc = report(scoreImplementation(rbp, files));
    expect(loc).toMatchObject({ files: 10, scanned: 12, design: { total: 59, match: 59, mismatch: 0, review: 0 }, outsideDesign: { count: 0 } });
    const all = report(scoreImplementation(rbp, files, "all"));
    expect(all.design).toEqual(loc.design);
    expect(all.outsideDesign).toEqual({
      count: 2,
      messages: [
        "SettingsForm는 설계에 없는 컴포넌트입니다(코드에만 있음). — react-router/src/screens/settings/SettingsForm.tsx 에서 내보냄",
        "SettingsPage는 설계에 없는 컴포넌트입니다(코드에만 있음). — react-router/src/screens/settings/SettingsPage.tsx 에서 내보냄",
      ],
    });
  });

  it("라우터를 빼면 화면 주소를 맡는 곳이 없어 일치가 줄어든다(라우터를 읽은 것이 집계에 쓰였음)", () => {
    const noRouter = report(scoreImplementation(rbp, files.filter((f) => !f.path.endsWith("router.tsx"))));
    expect(noRouter.design.match).toBeLessThan(59);
  });
});

describe("내 컴퓨터용 상한과 오류", () => {
  const files = readLocalFolder(`${DEMO}/correct`);

  it("기본 상한은 1000개·파일 1MB·합계 20MB이고 서버 상한(30개·1MB)과 따로다", () => {
    expect(LOCAL_LIMITS).toEqual({ maxFiles: 1000, maxFileBytes: 1024 * 1024, maxTotalBytes: 20 * 1024 * 1024 });
  });

  it("상한을 넘으면 결과 대신 넘은 항목과 옵션 이름을 알린다. 전체 읽기면 위치 기준 읽기도 권한다", () => {
    const loc = scoreImplementation(bp, files, "blueprint-locations", { ...LOCAL_LIMITS, maxFiles: 5 });
    expect(loc).toEqual({ ok: false, message: "분석할 파일이 상한을 넘습니다: 파일 11개(상한 5개, --max-files).\n옵션으로 상한을 올려 주세요." });
    expect(scoreImplementation(bp, files, "all", { ...LOCAL_LIMITS, maxFiles: 5 })).toEqual({
      ok: false,
      message: "분석할 파일이 상한을 넘습니다: 파일 11개(상한 5개, --max-files).\n옵션으로 상한을 올리거나, --all 없이 설계도 위치 기준으로 읽어 보세요.",
    });
    const big = [...files, { path: "correct/src/shared/lib/big.ts", content: "x".repeat(2 * 1024 * 1024) }];
    const total = scoreImplementation(bp, big, "all", { ...LOCAL_LIMITS, maxFileBytes: 4 * 1024 * 1024, maxTotalBytes: 1024 * 1024 });
    expect(total).toEqual({ ok: false, message: "분석할 파일이 상한을 넘습니다: 합계가 1MB를 넘음(--max-total-mb).\n옵션으로 상한을 올리거나, --all 없이 설계도 위치 기준으로 읽어 보세요." });
  });

  it("HTML 설계도와 검사할 파일이 없는 경우는 API와 같은 문구", () => {
    expect(scoreImplementation({ ...bp, stack: { ...bp.stack, framework: "html" } }, files)).toEqual({ ok: false, message: "HTML 프로젝트는 구현 검사를 지원하지 않습니다." });
    const none = scoreImplementation(bp, files.filter((f) => f.path.endsWith("tsconfig.json")));
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.message).toContain("검사할 코드: 분석할 .ts·.tsx 파일이 없습니다.");
  });
});

describe("명령(npm run score)", async () => {
  const base = ["--blueprint", BLUEPRINT_FILE, "--code", `${DEMO}/renamed`];

  it("텍스트 출력에 읽은 방식 한 줄과 집계가 나온다. 종료 코드 0", async () => {
    const r = await runScore(base);
    expect(r.code).toBe(0);
    expect(r.out).toContain("코드: renamed (11개 분석 / 폴더의 대상 파일 11개, 설정 파일 1개 읽음 / 못 따라간 설정 0개)");
    expect(r.out).toContain("읽은 방식: 설계도 위치 기준으로 읽음");
    expect(r.out).toContain("설계 준수   설계 항목 65개 중 일치 56개 · 불일치 0개 · 확인 필요 9개");
    expect(r.out).toContain("결과 카드   확실 0장 · 확인 필요 3장");
    expect((await runScore([...base, "--all"])).out).toContain("읽은 방식: 코드 폴더 전체(--all)");
  });

  it("--json은 한 줄 JSON(승인된 항목)", async () => {
    const r = await runScore([...base, "--json"]);
    expect(r.out.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(r.out)).toEqual({
      blueprint: { file: BLUEPRINT_FILE, title: "상품 상세", stack: { framework: "next", styling: "tailwind", architecture: "fsd" } },
      code: { source: `${DEMO}/renamed`, mode: "blueprint-locations", files: 11, scanned: 11, configs: { read: 1, unsupported: 0 } },
      design: { total: 65, match: 56, mismatch: 0, review: 9 },
      ban: { violated: 0, unknown: 2 },
      outsideDesign: { count: 0, messages: [] },
      cards: { certain: 0, review: 3 },
    });
    expect(r.out.trim()).toBe(scoreJson(report(scoreImplementation(bp, readLocalFolder(`${DEMO}/renamed`))), BLUEPRINT_FILE, `${DEMO}/renamed`));
  });

  it("--max-files로 상한을 바꾸면 그 값으로 검사하고, 숫자가 아니면 거부한다. 종료 코드 1", async () => {
    expect(await runScore([...base, "--max-files", "5"])).toMatchObject({ code: 1, err: expect.stringContaining("상한 5개") });
    expect((await runScore([...base, "--max-files", "11"])).code).toBe(0);
    expect(await runScore([...base, "--max-file-kb", "abc"])).toMatchObject({ code: 1, err: "--max-file-kb는 0보다 큰 숫자여야 합니다." });
  });

  it("인자가 빠졌거나 파일이 없으면 사용법·원인을 알린다", async () => {
    expect(await runScore([])).toMatchObject({ code: 1, err: expect.stringContaining("사용법: npm run score") });
    expect(await runScore(["--blueprint", "없는.json", "--code", DEMO])).toMatchObject({ code: 1, err: "설계도 파일이 없습니다: 없는.json" });
    expect(await runScore(["--blueprint", "package.json", "--code", `${DEMO}/renamed`])).toMatchObject({ code: 1, err: expect.stringContaining("설계도 형식이 올바르지 않습니다.") });
  });

  it("--tsconfig로 준 파일은 프로젝트 맨 위 설정(<폴더>/tsconfig.json)으로 간주하고 폴더의 같은 경로 설정을 바꾼다", async () => {
    const files = readLocalFolder(`${DEMO}/renamed`, `${DEMO}/correct/tsconfig.json`);
    expect(files.filter((f) => f.path === "renamed/tsconfig.json")).toHaveLength(1);
    expect(files[0]).toEqual({ path: "renamed/tsconfig.json", content: readFileSync(`${DEMO}/correct/tsconfig.json`, "utf8") });
    expect((await runScore([...base, "--tsconfig", `${DEMO}/correct/tsconfig.json`])).code).toBe(0);
  });
});

describe("명령 --repo: GitHub 공개 저장소(가짜 fetch, 실제 GitHub 호출 없음)", () => {
  const SHA = "0123456789abcdef0123456789abcdef01234567";
  // 시연 폴더 renamed를 GitHub tarball 모양(맨 위 폴더 owner-repo-sha/)으로 감싼다
  const tgz = () =>
    gzipSync(
      buildTar([
        { name: "pax_global_header", type: "g", content: paxRecord("comment", SHA) },
        ...readLocalFolder(`${DEMO}/renamed`).map((f) => ({ name: f.path.replace(/^renamed\//, "acme-renamed-0123456/"), content: f.content })),
      ]),
    );
  const fakeFetch = () => {
    const replies = [
      () => Response.json({ private: false, visibility: "public", size: 10, default_branch: "main" }),
      () => new Response(null, { status: 302, headers: { location: "https://codeload.github.com/acme/renamed/legacy.tar.gz/refs/heads/main" } }),
      () => new Response(tgz() as unknown as BodyInit, { status: 200 }),
    ];
    let i = 0;
    return (async () => replies[i++]()) as unknown as typeof fetch;
  };
  const repoArgs = ["--blueprint", BLUEPRINT_FILE, "--repo", "https://github.com/acme/renamed"];

  it("저장소에서 읽어도 같은 폴더를 로컬로 읽을 때와 같은 숫자이고, 저장소·브랜치·커밋 줄이 붙는다", async () => {
    const local = await runScore(["--blueprint", BLUEPRINT_FILE, "--code", `${DEMO}/renamed`]);
    const remote = await runScore(repoArgs, { fetch: fakeFetch() });
    expect(remote.code).toBe(0);
    expect(remote.out).toContain("저장소: acme/renamed @ main (커밋 0123456)");
    expect(remote.out.replace(/^저장소: .*\n/m, "")).toBe(local.out);
  });

  it("--json에는 code.repo(이름·브랜치·커밋 전체·하위 폴더)가 붙는다", async () => {
    const r = await runScore([...repoArgs, "--json"], { fetch: fakeFetch() });
    const j = JSON.parse(r.out);
    expect(j.code).toEqual({ source: "https://github.com/acme/renamed", mode: "blueprint-locations", files: 11, scanned: 11, configs: { read: 1, unsupported: 0 }, repo: { name: "acme/renamed", ref: "main", commit: SHA, subdir: null } });
    expect(j.design).toEqual({ total: 65, match: 56, mismatch: 0, review: 9 });
  });

  it("--code와 --repo는 하나만, --subdir는 --repo와 함께, 잘못된 주소는 요청 전에 거부", async () => {
    let called = false;
    const spy = (async () => {
      called = true;
      throw new Error("불리면 안 됨");
    }) as unknown as typeof fetch;
    expect(await runScore([...repoArgs, "--code", `${DEMO}/renamed`], { fetch: spy })).toMatchObject({ code: 1, err: expect.stringContaining("--code와 --repo 중 하나만") });
    expect(await runScore(["--blueprint", BLUEPRINT_FILE, "--code", `${DEMO}/renamed`, "--subdir", "apps/web"])).toMatchObject({ code: 1, err: "--subdir는 --repo와 함께 씁니다." });
    expect(await runScore(["--blueprint", BLUEPRINT_FILE, "--repo", "https://evil.example/acme/renamed"], { fetch: spy })).toMatchObject({ code: 1, err: expect.stringContaining("github.com의 https 주소만") });
    expect(await runScore([...repoArgs, "--subdir", "../x"], { fetch: spy })).toMatchObject({ code: 1, err: expect.stringContaining("하위 폴더는") });
    expect(called).toBe(false);
  });

  it("저장소 읽기 오류는 그 문구로 끝난다(종료 코드 1)", async () => {
    const notFound = (async () => new Response("{}", { status: 404 })) as unknown as typeof fetch;
    expect(await runScore(repoArgs, { fetch: notFound })).toEqual({ code: 1, out: "", err: "저장소가 없거나 공개 저장소가 아닙니다." });
  });
});
