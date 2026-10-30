"use client";

import dynamic from "next/dynamic";

// React Flow는 브라우저에서만 그린다(서버 렌더링에서는 크기를 잴 수 없다)
const TreeView = dynamic(() => import("./TreeView"), {
  ssr: false,
  loading: () => <p className="text-sm text-foreground-tertiary">트리를 불러오는 중…</p>,
});

export default TreeView;
