import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "VerifyAI — AI answers, human-grade verification",
  description: "Real-time hallucination detection and correction powered by DistilBERT, GPT-4, and RAG",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      </head>
      <body>
        <div className="bg-grid" />
        {children}
      </body>
    </html>
  )
}