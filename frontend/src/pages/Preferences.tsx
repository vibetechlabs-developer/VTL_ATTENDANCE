import { Bell, Globe, Moon, Sun, Mail, Smartphone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import { useEffect } from "react";

export default function Preferences() {
  const { preferences, updatePreferences } = useAuthStore();

  useEffect(() => {
    const root = document.documentElement;
    if (preferences.theme === "dark") root.classList.add("dark");
    else if (preferences.theme === "light") root.classList.remove("dark");
    else {
      const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.toggle("dark", sysDark);
    }
  }, [preferences.theme]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Preferences</h1>
        <p className="text-muted-foreground mt-1">Personalize how Vibe Tech Labs works for you.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="card-3d border-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sun className="h-4 w-4" /> Appearance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Theme</Label>
              <Select value={preferences.theme} onValueChange={(v: any) => { updatePreferences({ theme: v }); toast.success(`Theme set to ${v}`); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="light"><span className="inline-flex items-center gap-2"><Sun className="h-3.5 w-3.5" /> Light</span></SelectItem>
                  <SelectItem value="dark"><span className="inline-flex items-center gap-2"><Moon className="h-3.5 w-3.5" /> Dark</span></SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Language</Label>
              <Select value={preferences.language} onValueChange={(v: any) => updatePreferences({ language: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="hi">हिन्दी (Hindi)</SelectItem>
                  <SelectItem value="gu">ગુજરાતી (Gujarati)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-2"><Globe className="h-3.5 w-3.5" /> Timezone</Label>
              <Select value={preferences.timezone} onValueChange={(v) => updatePreferences({ timezone: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Asia/Kolkata">Asia/Kolkata (IST)</SelectItem>
                  <SelectItem value="Asia/Dubai">Asia/Dubai (GST)</SelectItem>
                  <SelectItem value="Europe/London">Europe/London (GMT)</SelectItem>
                  <SelectItem value="America/New_York">America/New_York (EST)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="card-3d border-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4" /> Notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { key: "emailNotifications" as const, icon: Mail, title: "Email notifications", desc: "Approvals, leaves and weekly digest." },
              { key: "pushNotifications" as const, icon: Smartphone, title: "Push notifications", desc: "Real-time updates on this device." },
              { key: "weeklyReport" as const, icon: Bell, title: "Weekly report", desc: "Get a summary every Monday morning." },
            ].map((p) => (
              <div key={p.key} className="flex items-center justify-between rounded-2xl border border-border bg-muted/30 p-3.5">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-xl bg-accent flex items-center justify-center text-primary">
                    <p.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{p.title}</p>
                    <p className="text-xs text-muted-foreground">{p.desc}</p>
                  </div>
                </div>
                <Switch
                  checked={preferences[p.key]}
                  onCheckedChange={(v) => updatePreferences({ [p.key]: v } as any)}
                />
              </div>
            ))}
            <Button onClick={() => toast.success("Preferences saved")} className="w-full bg-sage-3d shadow-3d border-0 text-primary-foreground mt-2">
              Save preferences
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
