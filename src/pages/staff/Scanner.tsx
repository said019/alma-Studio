import { useState } from "react";
import { StaffGuard } from "@/components/staff/StaffGuard";
import { StaffLayout } from "@/components/staff/StaffLayout";
import CheckinScanner from "@/components/admin/CheckinScanner";
import { Button } from "@/components/ui/button";
export default function Scanner() {
  const [open, setOpen] = useState(true);
  return <StaffGuard allowedRoles={["reception"]}><StaffLayout>
    <h1 className="text-3xl font-bold">Check-in por QR</h1>
    <p className="my-4">Escanea el pase del usuario para registrar su asistencia.</p>
    <Button onClick={() => setOpen(true)}>Abrir escáner</Button>
    <CheckinScanner open={open} onOpenChange={setOpen} endpoint="/staff/reception/checkin/scan" />
  </StaffLayout></StaffGuard>;
}
