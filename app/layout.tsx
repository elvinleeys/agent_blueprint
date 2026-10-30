import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Pretendard (SIL OFL 1.1, THIRD_PARTY_NOTICES.md)
const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  variable: "--font-pretendard",
  weight: "45 920",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AgentBlueprint",
  description: "AI 에이전트가 코드를 쓰기 전에 프론트엔드 구조를 설계하고 지시서로 바꿔 주는 도구",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${pretendard.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
