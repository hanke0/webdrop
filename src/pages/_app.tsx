import "@/styles/globals.css";
import type { AppProps } from "next/app";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "WebDrop",
  description: "A peer-to-peer file sharing ad hoc service.",
};

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
