import StaffSessionBootstrap from "@/components/staff/staff-session-bootstrap";

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <StaffSessionBootstrap>
      <div className="min-h-screen bg-canvas">
        {children}
      </div>
    </StaffSessionBootstrap>
  );
}
