import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/StatusPill";
import { Shield, Eye } from "lucide-react";
import { safeFormatDistanceToNow } from "@/utils/safeDate";
import { useAuthStore } from "@/store/authStore";
import { securityOverviewRequest } from "@/lib/api";

export default function SecurityPanel() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [loginLogs, setLoginLogs] = useState<any[]>([]);
  const [faceLogs, setFaceLogs] = useState<any[]>([]);

  useEffect(() => {
    if (!accessToken) return;
    const run = async () => {
      const res = await securityOverviewRequest(accessToken);
      if (!res.ok) return;
      const body = (await res.json().catch(() => ({}))) as { login_logs?: any[]; face_logs?: any[] };
      setLoginLogs(body.login_logs || []);
      setFaceLogs(body.face_logs || []);
    };
    void run();
  }, [accessToken]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Security</h1>
        <p className="text-muted-foreground mt-1">Logins and face verifications.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Login logs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loginLogs.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 p-3 rounded-lg hover:bg-muted/40">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{l.user}</p>
                  <p className="text-xs text-muted-foreground truncate">{l.device} · {l.ip}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusPill label={l.status} variant={l.status === "success" ? "success" : "destructive"} />
                  <span className="text-[11px] text-muted-foreground">
                    {safeFormatDistanceToNow(l.timestamp, { addSuffix: true })}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Face verification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {faceLogs.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-3 p-3 rounded-lg hover:bg-muted/40">
                <div>
                  <p className="text-sm font-medium">{f.user}</p>
                  <p className="text-xs text-muted-foreground">
                    {f.event} · Confidence: {typeof f.confidence === "number" ? `${f.confidence}%` : "N/A"}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusPill label={f.status} variant={f.status === "verified" ? "success" : "warning"} />
                  <span className="text-[11px] text-muted-foreground">
                    {safeFormatDistanceToNow(f.timestamp, { addSuffix: true })}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
