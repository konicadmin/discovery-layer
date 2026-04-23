import "./globals.css";

export const metadata = {
  title: "Discovery Layer",
  description: "B2B service procurement",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
