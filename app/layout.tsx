import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "موقع ذكاء لفك التشفير | Deka AI",
  description:
    "منصة تعتمد على الذكاء الاصطناعي للمساعدة في فك تشفير الملفات والنصوص مع تصحيح الأخطاء الشائعة تلقائياً.",
  keywords: [
    "ذكاء اصطناعي",
    "فك تشفير",
    "تصحيح أخطاء",
    "ملفات",
    "Base64",
    "ROT13"
  ]
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
