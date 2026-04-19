import "./globals.css";
export const metadata = { title: "Cockpit" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body className="cockpit-body">{children}</body></html>;
}
