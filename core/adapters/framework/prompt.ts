import type { Blueprint, ComponentNode } from "../../schema/blueprint";

type Framework = Blueprint["stack"]["framework"];

export const FRAMEWORK_NAME: Record<Framework, string> = { html: "HTML", react: "React", next: "Next.js" };

/** 노드 목록에 적는 렌더링 방식. Next.js가 아니면 null(적지 않는다) */
export function renderModeText(framework: Framework, mode: ComponentNode["renderMode"]): string | null {
  if (framework !== "next" || mode === null) return null;
  return mode === "server" ? "Server Component" : "Client Component";
}

/** 화면 주소를 라우터 형식으로: /products/[id] → /products/:id, [...slug]·[[...slug]] → * */
export const routerPath = (route: string) =>
  route.trim().replace(/\[\[\.\.\.[^\]]+\]\]|\[\.\.\.[^\]]+\]/g, "*").replace(/\[([^\]]+)\]/g, ":$1");

/** 화면 개요에 적는 화면 주소. React는 라우터 형식, 그 외는 입력 그대로 */
export const displayRoute = (framework: Framework, route: string) => (framework === "react" ? routerPath(route) : route.trim());

/** React 전용 규칙: 라우팅(Next.js는 app 라우팅 파일이 대신한다). 기존 라우터가 없으면 임의로 고르지 않는다 */
export function routingGuide(framework: Framework, pageName: string, route: string | null): string[] {
  if (framework !== "react") return [];
  const path = route?.trim() ? routerPath(route) : null;
  const connect = path ? `\`${pageName}\`을(를) \`${path}\` 경로에 연결한다.` : "화면 주소가 비어 있어 연결할 경로를 정할 수 없다. 화면 주소를 정한 뒤 연결한다.";
  return [`기존 프로젝트의 라우팅 라이브러리와 설정 방식을 따른다. ${connect} 기존 라우터가 없다면 임의로 라이브러리를 설치하거나 선택하지 않고 보고한다.`];
}

/** React 전용 규칙: 페이지의 데이터 조회 방식 */
export const dataLoadingGuide = (framework: Framework): string[] =>
  framework === "react" ? ["페이지의 데이터 조회는 기존 프로젝트의 데이터 로딩 방식(라우터 loader, 데이터 조회 라이브러리 등)을 따른다. 기존 방식이 없으면 임의로 정하지 않고 보고한다."] : [];

/** 필수 규칙 안의 스택 규칙. html은 전용 규칙이 없다 */
export function frameworkGuide(framework: Framework): string[] {
  if (framework === "react") return ["모든 컴포넌트는 브라우저에서 실행된다."];
  if (framework !== "next") return [];
  return [
    "상태·이벤트·브라우저 API·훅을 쓰면 Client Component이고, 그 파일은 맨 위에 `\"use client\"`를 둔다. 쓰지 않으면 Server Component로 둔다.",
    "Client 파일이 직접 가져오는 컴포넌트는 Client 모듈에 포함된다. Server Component를 Client 파일 안에서 직접 가져오지 않는다.",
    "Server Component가 만든 UI를 Client Component에 `children` 같은 props로 넘기는 것은 허용한다.",
    "서버에서 조회한 데이터는 필요한 Client Component에 props로 전달한다.",
    "설계도에서 client 노드 아래 노드는 그 client 파일이 가져오는 컴포넌트다. Server로 유지할 UI는 설계도에서 server 부모 아래 두고, 구현할 때 `children`으로 넘긴다.",
  ];
}
