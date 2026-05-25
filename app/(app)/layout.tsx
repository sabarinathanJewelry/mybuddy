import KioskProvider from "@/components/layout/kiosk-provider";
import SessionBootstrap from "@/components/layout/session-bootstrap";
import Sidebar from "@/components/layout/sidebar";
import Topbar from "@/components/layout/topbar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionBootstrap>
      <KioskProvider sidebar={<Sidebar />} topbar={<Topbar />}>
        {children}
      </KioskProvider>
    </SessionBootstrap>
  );
}
