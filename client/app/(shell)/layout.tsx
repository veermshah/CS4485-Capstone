import { Topbar } from "@/components/app/topbar";

export default function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="min-h-screen">
        <Topbar />
        <main className="mx-auto max-w-[1440px] p-6">{children}</main>
      </div>
    </div>
  );
}
