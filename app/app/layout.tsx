import "./globals.css";

export const metadata = {
  title: "AdRehearsal",
  description: "Simulated Indian viewers react to your ad, second by second. Explains likely problems; does not predict sales.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
