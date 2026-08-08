import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "./components/Sidebar";

export const metadata: Metadata = {
  title: "IP 行业资讯快报 | 新文创老贾聊IP",
  description:
    "动漫 / 潮玩 / IP / ACG / 文创行业自动新闻聚合。来源:新文创老贾聊IP",
};

const setInitialThemeScript = `
(function() {
  try {
    var t = localStorage.getItem('theme');
    if (t === 'light' || t === 'dark') {
      document.documentElement.setAttribute('data-theme', t);
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="zh-CN"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: setInitialThemeScript }}
        />
        {process.env.NEXT_PUBLIC_UMAMI_URL && process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID && (
          <script
            defer
            src={`${process.env.NEXT_PUBLIC_UMAMI_URL}/script.js`}
            data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
          />
        )}
      </head>
      <body className="min-h-full">
        <div className="app-layout">
          <Sidebar />
          <main className="app-main">{children}</main>
        </div>
      </body>
    </html>
  );
}
