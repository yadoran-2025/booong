import "./globals.css";
import "./service.css";
import "./booong.css";
import BungmoWorkspace from "./components/BungmoWorkspace.js";

export const metadata = {
  title: "BOOONG — 우리 모임 대시보드",
  description: "운영자가 관리하는 붕모 일정, 여행 계획, 게스트와 정산",
  robots: { index: false, follow: false }
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff"
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko" data-scroll-behavior="smooth">
      <head>
        <link rel="stylesheet" href="https://yadoran-2025.github.io/booong-design-system/releases/v2.0.0/booong.css" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css" />
      </head>
      <body className="bungmo-app"><BungmoWorkspace>{children}</BungmoWorkspace></body>
    </html>
  );
}
