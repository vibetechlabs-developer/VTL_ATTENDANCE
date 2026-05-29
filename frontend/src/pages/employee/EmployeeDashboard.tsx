import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Square, Coffee, Clock, CalendarDays, MessageSquare, User,
  Pause, AlertTriangle, Sparkles, CheckCircle2, ScanFace, MapPin, ArrowLeft, Loader2, Phone
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Link } from "react-router-dom";
import { useAttendanceStore } from "@/store/attendanceStore";
import { CheckInModal } from "@/components/CheckInModal";
import { useAuthStore, userHasRole } from "@/store/authStore";
import { useDataStore } from "@/store/dataStore";
import { cn, userFirstName } from "@/lib/utils";
import { safeGetItem, safeSetItem } from "@/utils/storageSafe";
import { toast } from "sonner";
import { format, subDays, startOfWeek, endOfWeek, isWithinInterval, parseISO } from "date-fns";
import { formatTimestampMs, parseApiDate } from "@/utils/safeDate";
import { bumpGlobalIdleActivity, clearGlobalAutoIdleFlag } from "@/utils/idleActivity";
import {
  applyAttendanceSession,
  isOnCallFromSession,
  type AttendanceSessionBody,
} from "@/utils/attendanceSession";
import { canUseDesktopNotifications, ensureNotificationPermission } from "@/utils/desktopNotify";
import {
  attendanceBreakEndRequest,
  attendanceBreakStartRequest,
  attendanceCallEndRequest,
  attendanceCallStartRequest,
  attendanceHistoryRequest,
  attendanceOvertimeNotifyRequest,
  attendanceSessionRequest,
  leaveBalanceRequest,
  leaveHistoryRequest,
  updatesPostRequest,
} from "@/lib/api";
import { LeaveBalanceRings, type LeaveBalanceShape } from "@/components/LeaveBalanceRings";
import { Skeleton } from "@/components/ui/skeleton";
import { Flame } from "lucide-react";
import { MAX_BREAK_DURATION_MS, msUntilBreakAutoResume } from "@/utils/breakLimits";

function formatDuration(ms: number) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

const FULL_DAY_MS = 8 * 60 * 60 * 1000;
const WEEK_GOAL_HOURS = 40;

const EARLY_REASON_CHIPS = [
  "Doctor appointment",
  "Half day",
  "Family",
  "Personal errand",
  "Feeling unwell",
  "Approved early leave",
];

type SalesDailyReport = {
  blogPosts: string;
  pptPosts: string;
  businessListings: string;
  classifiedAds: string;
  blogLinks: string;
  pptLinks: string;
  businessListingLinks: string[];
  classifiedAdsLinks: string[];
  totalCalls: string;
  callsReceived: string;
  meetings: string;
  clientsDone: string;
  dataExtractedIndia: string;
  dataExtractedAbroad: string;
  mailSentB2B: string;
  mailSentGeneral: string;
  linkedinPost: "yes" | "no" | "";
  linkedinConnections: string;
  linkedinMessages: string;
  linkedinDataExtraction: string;
  newspaperRead: "yes" | "no" | "";
  newspaperImportantNews: string;
  groupPhotosAdded: boolean;
};

const EMPTY_SALES_REPORT: SalesDailyReport = {
  blogPosts: "",
  pptPosts: "",
  businessListings: "",
  classifiedAds: "",
  blogLinks: "",
  pptLinks: "",
  businessListingLinks: ["", "", "", "", ""],
  classifiedAdsLinks: ["", "", "", "", ""],
  totalCalls: "",
  callsReceived: "",
  meetings: "",
  clientsDone: "",
  dataExtractedIndia: "",
  dataExtractedAbroad: "",
  mailSentB2B: "",
  mailSentGeneral: "",
  linkedinPost: "",
  linkedinConnections: "",
  linkedinMessages: "",
  linkedinDataExtraction: "",
  newspaperRead: "",
  newspaperImportantNews: "",
  groupPhotosAdded: false,
};

const SALES_REPORT_FIELD_META: { key: keyof SalesDailyReport; label: string; placeholder: string; apiKey?: string }[] = [
  { key: "blogPosts", label: "1) Blog posts (OR with PPT, total min 1)", placeholder: "Count e.g. 1", apiKey: "blog_posts" },
  { key: "pptPosts", label: "2) PPT posts (OR with Blog, total min 1)", placeholder: "Count e.g. 0 or 1", apiKey: "ppt_posts" },
  { key: "businessListings", label: "3) Business listings (OR with Classified, total min 5)", placeholder: "Count e.g. 5", apiKey: "business_listings" },
  { key: "classifiedAds", label: "4) Classified ads (OR with Business, total min 5)", placeholder: "Count e.g. 0 or 5", apiKey: "classified_ads" },
  { key: "blogLinks", label: "Blog post links (URLs)", placeholder: "Paste blog URLs, one per line", apiKey: "blog_links" },
  { key: "pptLinks", label: "PPT links (URLs)", placeholder: "Paste PPT URLs, one per line", apiKey: "ppt_links" },
  { key: "businessListingLinks", label: "Business listing links (5 URLs)", placeholder: "https://...", apiKey: "business_links" },
  { key: "classifiedAdsLinks", label: "Classified ad links (5 URLs)", placeholder: "https://...", apiKey: "classified_links" },
  { key: "totalCalls", label: "5) Total calls (min 100)", placeholder: "e.g. 110", apiKey: "total_calls" },
  { key: "callsReceived", label: "5b) Calls received (min 80)", placeholder: "e.g. 85", apiKey: "calls_received" },
  { key: "meetings", label: "6) Total meetings", placeholder: "e.g. 3", apiKey: "meetings" },
  { key: "clientsDone", label: "7) Total clients done", placeholder: "e.g. 1", apiKey: "clients_done" },
  { key: "dataExtractedIndia", label: "8) Data extracted India (500)", placeholder: "e.g. 500", apiKey: "data_extracted_india" },
  { key: "dataExtractedAbroad", label: "8b) Data extracted Abroad (500)", placeholder: "e.g. 500", apiKey: "data_extracted_abroad" },
  { key: "mailSentB2B", label: "9) Mail sent B2B collaborations (10)", placeholder: "e.g. 12", apiKey: "mail_sent_b2b" },
  { key: "mailSentGeneral", label: "10) Mail sent general business (10)", placeholder: "e.g. 10", apiKey: "mail_sent_general" },
];

const SALES_MINIMUMS: Partial<Record<keyof SalesDailyReport, number>> = {
  businessListings: 5,
  classifiedAds: 5,
  totalCalls: 100,
  callsReceived: 80,
  dataExtractedIndia: 500,
  dataExtractedAbroad: 500,
  mailSentB2B: 10,
  mailSentGeneral: 10,
  linkedinMessages: 100,
  linkedinDataExtraction: 25,
};

const SALES_API_FIELD_LABELS: Record<string, string> = {
  ...Object.fromEntries(
    SALES_REPORT_FIELD_META.filter((field) => field.apiKey).map((field) => [field.apiKey!, field.label]),
  ),
  group_photos_added: "Photos added in group",
};

const SALES_API_TO_FRONTEND: Record<string, keyof SalesDailyReport> = {
  ...Object.fromEntries(
    SALES_REPORT_FIELD_META.filter((field) => field.apiKey).map((field) => [field.apiKey!, field.key]),
  ),
  group_photos_added: "groupPhotosAdded",
};

type CheckoutFieldError = {
  fieldId: string;
  message: string;
};

function cleanFieldLabel(label: string): string {
  return label.replace(/^\d+[a-z]?\)\s*/, "").trim();
}

function splitUrls(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function collectCheckoutErrors(
  workNote: string,
  salesReport: SalesDailyReport,
  earlyReason: string,
  isSales: boolean,
  isEarly: boolean,
): CheckoutFieldError[] {
  const errors: CheckoutFieldError[] = [];

  if (!workNote.trim()) {
    errors.push({ fieldId: "workNote", message: "Daily update is required" });
  }

  if (isSales) {
    const blogRaw = String(salesReport.blogPosts ?? "").trim();
    const pptRaw = String(salesReport.pptPosts ?? "").trim();
    const businessRaw = String(salesReport.businessListings ?? "").trim();
    const classifiedRaw = String(salesReport.classifiedAds ?? "").trim();
    const blogLinksRaw = String(salesReport.blogLinks ?? "").trim();
    const pptLinksRaw = String(salesReport.pptLinks ?? "").trim();
    const businessLinks = Array.isArray(salesReport.businessListingLinks) ? salesReport.businessListingLinks : [];
    const classifiedLinks = Array.isArray(salesReport.classifiedAdsLinks) ? salesReport.classifiedAdsLinks : [];
    const linkedinPost = salesReport.linkedinPost;
    const linkedinConnectionsRaw = String(salesReport.linkedinConnections ?? "").trim();
    const linkedinMessagesRaw = String(salesReport.linkedinMessages ?? "").trim();
    const linkedinDataExtractionRaw = String(salesReport.linkedinDataExtraction ?? "").trim();
    const newspaperRead = salesReport.newspaperRead;
    const newspaperImportantNewsRaw = String(salesReport.newspaperImportantNews ?? "").trim();

    const parseMaybeNumber = (raw: string): number | null => {
      if (!raw) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    };

    const blogNum = parseMaybeNumber(blogRaw);
    const pptNum = parseMaybeNumber(pptRaw);
    const businessNum = parseMaybeNumber(businessRaw);
    const classifiedNum = parseMaybeNumber(classifiedRaw);

    const allValidUrls = (urls: string[]): boolean => urls.every((p) => /^https?:\/\//i.test(p));

    // Validate numeric typing (only if user has typed something).
    if (blogRaw && blogNum === null) {
      errors.push({ fieldId: "blogPosts", message: "Blog post should be a number" });
    }
    if (pptRaw && pptNum === null) {
      errors.push({ fieldId: "pptPosts", message: "PPT post should be a number" });
    }
    if (businessRaw && businessNum === null) {
      errors.push({ fieldId: "businessListings", message: "Business listing should be a number" });
    }
    if (classifiedRaw && classifiedNum === null) {
      errors.push({ fieldId: "classifiedAds", message: "Classified ads should be a number" });
    }

    const blogOk = (blogNum ?? 0) >= 1;
    const pptOk = (pptNum ?? 0) >= 1;
    if (!blogOk && !pptOk) {
      errors.push({
        fieldId: "blogPosts",
        message: "Add at least 1 Blog post OR 1 PPT post",
      });
      errors.push({
        fieldId: "pptPosts",
        message: "Add at least 1 Blog post OR 1 PPT post",
      });
    }

    const businessOk = (businessNum ?? 0) >= 5;
    const classifiedOk = (classifiedNum ?? 0) >= 5;
    if (!businessOk && !classifiedOk) {
      errors.push({
        fieldId: "businessListings",
        message: "Add at least 5 Business listings OR 5 Classified ads",
      });
      errors.push({
        fieldId: "classifiedAds",
        message: "Add at least 5 Business listings OR 5 Classified ads",
      });
    }

    // Link requirements tied to counts.
    if (blogOk) {
      const urls = splitUrls(blogLinksRaw);
      if (!blogLinksRaw) {
        errors.push({
          fieldId: "blogLinks",
          message: "Paste at least 1 blog URL (for your blog posts)",
        });
      } else if (!allValidUrls(urls)) {
        errors.push({
          fieldId: "blogLinks",
          message: "Blog URLs must start with http or https (one per line)",
        });
      } else if (urls.length < 1) {
        errors.push({ fieldId: "blogLinks", message: "Paste at least 1 blog URL" });
      }
    }
    if (pptOk) {
      const urls = splitUrls(pptLinksRaw);
      if (!pptLinksRaw) {
        errors.push({
          fieldId: "pptLinks",
          message: "Paste at least 1 PPT URL (for your PPT posts)",
        });
      } else if (!allValidUrls(urls)) {
        errors.push({
          fieldId: "pptLinks",
          message: "PPT URLs must start with http or https (one per line)",
        });
      } else if (urls.length < 1) {
        errors.push({ fieldId: "pptLinks", message: "Paste at least 1 PPT URL" });
      }
    }
    if (businessOk) {
      const filled = businessLinks.map((l) => String(l || "").trim());
      if (filled.some((l) => !l)) {
        errors.push({ fieldId: "businessListingLinks", message: "Business listing links: add all 5 URLs" });
      } else if (!allValidUrls(filled)) {
        errors.push({ fieldId: "businessListingLinks", message: "Business listing links: URLs must start with http/https" });
      }
    }
    if (classifiedOk) {
      const filled = classifiedLinks.map((l) => String(l || "").trim());
      if (filled.some((l) => !l)) {
        errors.push({ fieldId: "classifiedAdsLinks", message: "Classified ad links: add all 5 URLs" });
      } else if (!allValidUrls(filled)) {
        errors.push({ fieldId: "classifiedAdsLinks", message: "Classified ad links: URLs must start with http/https" });
      }
    }

    // LinkedIn: Post Yes/No, Messages >= 100, Data extraction >= 25
    if (!linkedinPost) {
      errors.push({ fieldId: "linkedinPost", message: "LinkedIn post: select Yes or No" });
    }
    const linkedinConnections = parseMaybeNumber(linkedinConnectionsRaw);
    if (!linkedinConnectionsRaw) {
      errors.push({ fieldId: "linkedinConnections", message: "LinkedIn connections is required" });
    } else if (linkedinConnections === null) {
      errors.push({ fieldId: "linkedinConnections", message: "LinkedIn connections: enter a valid number" });
    }
    const linkedinMessages = parseMaybeNumber(linkedinMessagesRaw);
    if (!linkedinMessagesRaw) {
      errors.push({ fieldId: "linkedinMessages", message: "LinkedIn messages is required (min 100)" });
    } else if (linkedinMessages === null) {
      errors.push({ fieldId: "linkedinMessages", message: "LinkedIn messages: enter a valid number" });
    } else if (linkedinMessages < 100) {
      errors.push({ fieldId: "linkedinMessages", message: `LinkedIn messages: minimum 100 (you entered ${linkedinMessages})` });
    }
    const linkedinDataExtraction = parseMaybeNumber(linkedinDataExtractionRaw);
    if (!linkedinDataExtractionRaw) {
      errors.push({ fieldId: "linkedinDataExtraction", message: "LinkedIn data extraction is required (min 25)" });
    } else if (linkedinDataExtraction === null) {
      errors.push({ fieldId: "linkedinDataExtraction", message: "LinkedIn data extraction: enter a valid number" });
    } else if (linkedinDataExtraction < 25) {
      errors.push({ fieldId: "linkedinDataExtraction", message: `LinkedIn data extraction: minimum 25 (you entered ${linkedinDataExtraction})` });
    }

    // Newspaper: Yes/No + important news text required if Yes
    if (!newspaperRead) {
      errors.push({ fieldId: "newspaperRead", message: "Newspaper reading: select Yes or No" });
    }
    if (newspaperRead === "yes" && !newspaperImportantNewsRaw) {
      errors.push({ fieldId: "newspaperImportantNews", message: "Important news is required (after reading newspaper)" });
    }

    if (!salesReport.groupPhotosAdded) {
      errors.push({ fieldId: "groupPhotosAdded", message: "Confirm photos added in group (checkbox required)" });
    }

    // Validate all other fields normally (required + minimum where applicable).
    for (const field of SALES_REPORT_FIELD_META) {
      if (
        field.key === "blogPosts" ||
        field.key === "pptPosts" ||
        field.key === "businessListings" ||
        field.key === "classifiedAds" ||
        field.key === "blogLinks" ||
        field.key === "pptLinks" ||
        field.key === "businessListingLinks" ||
        field.key === "classifiedAdsLinks"
      ) {
        continue;
      }

      const raw = String(salesReport[field.key] ?? "").trim();
      const cleanLabel = cleanFieldLabel(field.label);
      if (!raw) {
        errors.push({ fieldId: field.key, message: `${cleanLabel} is required` });
        continue;
      }

      const minimum = SALES_MINIMUMS[field.key];
      if (minimum === undefined) continue;

      const numericValue = Number(raw);
      if (!Number.isFinite(numericValue)) {
        errors.push({ fieldId: field.key, message: `${cleanLabel}: enter a valid number` });
      } else if (numericValue < minimum) {
        errors.push({
          fieldId: field.key,
          message: `${cleanLabel}: minimum ${minimum} (you entered ${numericValue})`,
        });
      }
    }
  }

  if (isEarly && !earlyReason.trim()) {
    errors.push({ fieldId: "earlyReason", message: "Reason for early check-out is required" });
  }

  return errors;
}

function mapApiCheckoutErrors(body: {
  missing_fields?: string[];
  invalid_fields?: { field: string; minimum: number; actual: unknown }[];
  duplicate_links?: { field: string; url: string }[];
}): CheckoutFieldError[] {
  const errors: CheckoutFieldError[] = [];

  const missing = body.missing_fields ?? [];
  const invalid = body.invalid_fields ?? [];

  const hasBothBlogPpt = missing.includes("blog_posts") && missing.includes("ppt_posts");
  const hasBothBizClass = missing.includes("business_listings") && missing.includes("classified_ads");

  for (const apiField of missing) {
    if ((apiField === "blog_posts" || apiField === "ppt_posts") && hasBothBlogPpt) continue;
    if (
      (apiField === "business_listings" || apiField === "classified_ads") &&
      hasBothBizClass
    ) {
      continue;
    }

    const fieldId = SALES_API_TO_FRONTEND[apiField] ?? apiField;
    const label = SALES_API_FIELD_LABELS[apiField] ?? apiField;
    errors.push({ fieldId, message: `${cleanFieldLabel(label)} is required` });
  }

  if (hasBothBlogPpt) {
    errors.push({ fieldId: "blogPosts", message: "Add at least 1 Blog post OR 1 PPT post" });
    errors.push({ fieldId: "pptPosts", message: "Add at least 1 Blog post OR 1 PPT post" });
  }
  if (hasBothBizClass) {
    errors.push({
      fieldId: "businessListings",
      message: "Add at least 5 Business listings OR 5 Classified ads",
    });
    errors.push({
      fieldId: "classifiedAds",
      message: "Add at least 5 Business listings OR 5 Classified ads",
    });
  }

  const hasBothBlogPptInvalid =
    invalid.some((x) => x.field === "blog_posts") && invalid.some((x) => x.field === "ppt_posts");
  const hasBothBizClassInvalid =
    invalid.some((x) => x.field === "business_listings") && invalid.some((x) => x.field === "classified_ads");

  for (const item of invalid) {
    if ((item.field === "blog_posts" || item.field === "ppt_posts") && hasBothBlogPptInvalid) continue;
    if (
      (item.field === "business_listings" || item.field === "classified_ads") &&
      hasBothBizClassInvalid
    ) {
      continue;
    }

    const fieldId = SALES_API_TO_FRONTEND[item.field] ?? item.field;
    const label = SALES_API_FIELD_LABELS[item.field] ?? item.field;
    const actual = item.actual ?? "invalid";
    errors.push({
      fieldId,
      message: `${cleanFieldLabel(label)}: minimum ${item.minimum} (you entered ${actual})`,
    });
  }

  for (const dup of body.duplicate_links ?? []) {
    const fieldId = SALES_API_TO_FRONTEND[dup.field] ?? dup.field;
    const label = SALES_API_FIELD_LABELS[dup.field] ?? dup.field;
    errors.push({
      fieldId,
      message: `${cleanFieldLabel(label)}: already submitted link — ${dup.url}`,
    });
  }

  if (hasBothBlogPptInvalid) {
    errors.push({ fieldId: "blogPosts", message: "Add at least 1 Blog post OR 1 PPT post" });
    errors.push({ fieldId: "pptPosts", message: "Add at least 1 Blog post OR 1 PPT post" });
  }
  if (hasBothBizClassInvalid) {
    errors.push({
      fieldId: "businessListings",
      message: "Add at least 5 Business listings OR 5 Classified ads",
    });
    errors.push({
      fieldId: "classifiedAds",
      message: "Add at least 5 Business listings OR 5 Classified ads",
    });
  }

  return errors;
}

function showCheckoutValidationToast(errors: CheckoutFieldError[], title: string) {
  const preview = errors.slice(0, 2).map((error) => error.message).join(" | ");
  toast.error(title, {
    description: preview ? `${preview}${errors.length > 2 ? " ..." : ""}` : "Please check required fields.",
    duration: 7000,
  });
}

function isLateCheckIn(iso: string): boolean {
  const dt = parseApiDate(iso);
  if (!dt) return false;
  return dt.getHours() > 10 || (dt.getHours() === 10 && dt.getMinutes() > 15);
}

function punctualityStreakFromLogs(logs: { date: string; check_in: string | null }[]): number {
  const map = new Map(logs.map((l) => [l.date, l]));
  let d = new Date();
  let streak = 0;
  for (let i = 0; i < 200; i++) {
    const w = d.getDay();
    if (w === 0 || w === 6) {
      d = subDays(d, 1);
      continue;
    }
    const key = format(d, "yyyy-MM-dd");
    const log = map.get(key);
    if (log?.check_in && !isLateCheckIn(log.check_in)) {
      streak += 1;
      d = subDays(d, 1);
    } else {
      break;
    }
  }
  return streak;
}

export default function EmployeeDashboard() {
  const { user, accessToken } = useAuthStore();
  const { addNotification } = useDataStore();
  const { status, checkInAt, checkOutAt, workedMsToday, totalBreakMs, breakStartAt, breaks, setCheckInAt, hydrateSession, startBreak, endBreak, checkOut, reset } = useAttendanceStore();
  const [now, setNow] = useState(Date.now());
  const [coDialog, setCoDialog] = useState(false);
  const [workNote, setWorkNote] = useState("");
  const [earlyReason, setEarlyReason] = useState("");
  const [outsideMeetingCheckout, setOutsideMeetingCheckout] = useState(false);
  const [outsideMeetingNote, setOutsideMeetingNote] = useState("");
  const [pendingCheckoutMeta, setPendingCheckoutMeta] = useState<{ allowOutsideMeeting: boolean; outsideNote: string }>({
    allowOutsideMeeting: false,
    outsideNote: "",
  });
  const [salesReport, setSalesReport] = useState<SalesDailyReport>(EMPTY_SALES_REPORT);
  const [checkoutErrors, setCheckoutErrors] = useState<CheckoutFieldError[]>([]);

  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [showCheckoutVerifyModal, setShowCheckoutVerifyModal] = useState(false);
  /** Daily update already posted; only face scan remains for checkout. */
  const [checkoutAwaitingFace, setCheckoutAwaitingFace] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [showHowToUse, setShowHowToUse] = useState(false);
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalanceShape | null>(null);
  const [leaveBalanceLoading, setLeaveBalanceLoading] = useState(true);
  const [weekWorkedHours, setWeekWorkedHours] = useState(0);
  const [streakDays, setStreakDays] = useState(0);
  const [quickNote, setQuickNote] = useState("");
  const [quickNoteSending, setQuickNoteSending] = useState(false);
  const [onCallMode, setOnCallMode] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (status !== "checked-in") setOnCallMode(false);
  }, [status]);

  useEffect(() => {
    if (status === "idle" || status === "checked-out") {
      setCheckoutAwaitingFace(false);
    }
  }, [status]);

  useEffect(() => {
    // First-time hint per employee.
    if (!user?.empId) return;
    const key = `vtl_hint_employee_${user.empId}`;
    if (safeGetItem(localStorage, key) === "1") return;
    setShowHowToUse(true);
    safeSetItem(localStorage, key, "1");
  }, [user?.empId]);

  const refreshSession = useCallback(async () => {
    if (!accessToken) return null;
    const res = await attendanceSessionRequest(accessToken);
    if (!res.ok) return null;
    const body = (await res.json().catch(() => ({}))) as AttendanceSessionBody;
    applyAttendanceSession(body, hydrateSession, reset);
    setOnCallMode(isOnCallFromSession(body));
    return body;
  }, [accessToken, hydrateSession, reset]);

  useEffect(() => {
    if (!accessToken) return;
    reset();
    void refreshSession();
  }, [accessToken, refreshSession, reset]);

  // Auto-resume break after 1 hour (client timer + server enforcement on session API).
  useEffect(() => {
    if (status !== "on-break" || !breakStartAt || !accessToken) return;

    const autoResume = async () => {
      const res = await attendanceBreakEndRequest(accessToken);
      if (res.ok) {
        endBreak(breakStartAt + MAX_BREAK_DURATION_MS);
        toast.info("Break ended automatically after 1 hour. You are back on the clock.");
        return;
      }
      const body = await refreshSession();
      if (body?.break_auto_resumed || !body?.active_break_start) {
        toast.info("Break ended automatically after 1 hour. You are back on the clock.");
      }
    };

    const remaining = msUntilBreakAutoResume(breakStartAt, now);
    if (remaining <= 0) {
      void autoResume();
      return;
    }
    const timer = window.setTimeout(() => void autoResume(), remaining);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, breakStartAt, accessToken, endBreak, refreshSession]);

  // Poll session while on break (covers background tabs / missed timers).
  useEffect(() => {
    if (status !== "on-break" || !accessToken) return;
    const interval = window.setInterval(() => void refreshSession(), 30_000);
    return () => window.clearInterval(interval);
  }, [status, accessToken, refreshSession]);

  // Real pending approvals from backend (per employee), instead of demo seedLeaves.
  useEffect(() => {
    if (!accessToken || !user?.empId) return;
    const run = async () => {
      try {
        const res = await leaveHistoryRequest(accessToken);
        if (!res.ok) return;
        const list = (await res.json().catch(() => [])) as any[];
        const count = list.filter((l) => String(l.status).toLowerCase() === "pending").length;
        setPendingApprovals(count);
      } catch {
        // silently ignore; banner simply won't show
      }
    };
    void run();
  }, [accessToken, user?.empId]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setLeaveBalanceLoading(true);
    void leaveBalanceRequest(accessToken).then(async (res) => {
      if (!res.ok || cancelled) {
        if (!cancelled) {
          setLeaveBalance(null);
          setLeaveBalanceLoading(false);
        }
        return;
      }
      const body = (await res.json().catch(() => null)) as LeaveBalanceShape | null;
      if (!cancelled) {
        setLeaveBalance(body);
        setLeaveBalanceLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    void attendanceHistoryRequest(accessToken).then(async (res) => {
      if (!res.ok || cancelled) return;
      const logs = (await res.json().catch(() => [])) as { date: string; check_in: string | null; total_hours?: number }[];
      if (!Array.isArray(logs) || cancelled) return;
      const ws = startOfWeek(new Date(), { weekStartsOn: 1 });
      const we = endOfWeek(new Date(), { weekStartsOn: 1 });
      let hours = 0;
      for (const l of logs) {
        if (!l.date) continue;
        const day = parseISO(l.date);
        if (Number.isNaN(day.getTime())) continue;
        if (isWithinInterval(day, { start: ws, end: we })) {
          hours += Number(l.total_hours ?? 0) || 0;
        }
      }
      setWeekWorkedHours(Math.round(hours * 10) / 10);
      setStreakDays(punctualityStreakFromLogs(logs));
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const greetingLine = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const currentBreak =
    status === "on-break" && breakStartAt
      ? Math.min(now - breakStartAt, MAX_BREAK_DURATION_MS)
      : 0;
  const liveWorkMs = checkInAt ? now - checkInAt - totalBreakMs - currentBreak : 0;
  const workMs = status === "checked-out" ? workedMsToday : liveWorkMs;
  const isEarly = workMs < FULL_DAY_MS;
  const remainingMs = Math.max(0, FULL_DAY_MS - workMs);
  const overtimeMs = Math.max(0, workMs - FULL_DAY_MS);
  const hasOvertime = overtimeMs > 0;
  const breakTakenMs = totalBreakMs + currentBreak;
  const breakAutoResumeInMs =
    status === "on-break" && breakStartAt ? msUntilBreakAutoResume(breakStartAt, now) : 0;
  const remainingDisplayMs = status === "checked-out" ? 0 : status === "idle" ? FULL_DAY_MS : remainingMs;
  const breakProgressPct = Math.min(100, Math.round((breakTakenMs / FULL_DAY_MS) * 100));

  useEffect(() => {
    if (!accessToken || !user?.empId) return;
    if (!hasOvertime || status === "idle") return;
    const dayKey = format(new Date(), "yyyy-MM-dd");
    const storageKey = `vtl_ot_notify_${user.empId}_${dayKey}`;
    if (safeGetItem(localStorage, storageKey) === "1") return;
    safeSetItem(localStorage, storageKey, "1");
    void attendanceOvertimeNotifyRequest(accessToken).then(async (res) => {
      if (!res.ok) return;
      const body = (await res.json().catch(() => ({}))) as { notified?: boolean; overtime_hours?: number };
      if (!body.notified) return;
      const otH = body.overtime_hours ?? overtimeMs / (60 * 60 * 1000);
      addNotification({
        title: "Overtime",
        body: `You've worked beyond 8 hours today. Overtime: ${Number(otH).toFixed(1)}h.`,
        type: "warning",
      });
      toast.info("Overtime is now counting — you've passed 8 hours today.");
    });
  }, [accessToken, user?.empId, hasOvertime, status, overtimeMs, addNotification]);

  const handleCheckIn = () => {
    setShowVerifyModal(true);
  };

  const handleVerified = (data?: { checkInAt?: string }) => {
    setShowVerifyModal(false);
    const serverMs = data?.checkInAt ? new Date(data.checkInAt).getTime() : Date.now();
    setCheckInAt(serverMs);
    bumpGlobalIdleActivity();
    void ensureNotificationPermission(true);
  };

  const handleBreak = async () => {
    if (!accessToken) {
      toast.error("Session expired. Please login again.");
      return;
    }
    if (status === "on-break") {
      const res = await attendanceBreakEndRequest(accessToken);
      const body = (await res.json().catch(() => ({}))) as { error?: string; break_minutes?: number; message?: string };
      if (!res.ok) {
        toast.error(body.error || "Could not end break");
        return;
      }
      clearGlobalAutoIdleFlag();
      endBreak();
      bumpGlobalIdleActivity();
      toast.success(body.message || "Break ended");
      return;
    }

    const res = await attendanceBreakStartRequest(accessToken);
    const body = (await res.json().catch(() => ({}))) as { error?: string; break_start?: string; message?: string };
    if (!res.ok) {
      toast.error(body.error || "Could not start break");
      return;
    }
    const serverStartMs = body.break_start ? new Date(body.break_start).getTime() : Date.now();
    clearGlobalAutoIdleFlag();
    startBreak(serverStartMs);
    toast.success(body.message || "Break started");
  };

  const toggleOnCallMode = async () => {
    if (!accessToken) {
      toast.error("Session expired. Please login again.");
      return;
    }
    if (onCallMode) {
      const res = await attendanceCallEndRequest(accessToken);
      const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        toast.error(body.error || "Could not end call mode");
        return;
      }
      setOnCallMode(false);
      bumpGlobalIdleActivity();
      toast.info(body.message || "Call mode ended — idle tracking resumed.");
      return;
    }
    const res = await attendanceCallStartRequest(accessToken);
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    if (!res.ok) {
      toast.error(body.error || "Could not start call mode");
      return;
    }
    setOnCallMode(true);
    bumpGlobalIdleActivity();
    toast.success(body.message || "On a call — auto-break paused while you are on the phone.");
  };

  const openCheckout = () => {
    if (checkoutAwaitingFace) {
      setShowCheckoutVerifyModal(true);
      toast.info("Your daily update is saved. Complete face scan to check out.");
      return;
    }
    setWorkNote("");
    setEarlyReason("");
    setOutsideMeetingCheckout(false);
    setOutsideMeetingNote("");
    setSalesReport(EMPTY_SALES_REPORT);
    setCheckoutErrors([]);
    setCoDialog(true);
  };

  const handleCheckoutVerifyOpenChange = (open: boolean) => {
    setShowCheckoutVerifyModal(open);
    if (!open && checkoutAwaitingFace) {
      toast.info("Daily update saved. Tap Check Out again to retry face scan only.");
    }
  };

  const confirmCheckout = async () => {
    const isSales = userHasRole(user, "sales");
    const validationErrors = collectCheckoutErrors(workNote, salesReport, earlyReason, isSales, isEarly);
    if (validationErrors.length > 0) {
      setCheckoutErrors(validationErrors);
      showCheckoutValidationToast(
        validationErrors,
        `Cannot check out — ${validationErrors.length} issue${validationErrors.length > 1 ? "s" : ""} found`,
      );
      return;
    }
    setCheckoutErrors([]);
    if (!accessToken) {
      toast.error("Session expired. Please login again.");
      return;
    }
    if (outsideMeetingCheckout && !outsideMeetingNote.trim()) {
      toast.error("Please add client meeting note for outside checkout");
      return;
    }
    if (!checkoutAwaitingFace) {
      const updateRes = await updatesPostRequest(
        accessToken,
        workNote.trim(),
        isSales
          ? {
              blog_posts: Number(salesReport.blogPosts),
              ppt_posts: Number(salesReport.pptPosts),
              business_listings: Number(salesReport.businessListings),
              classified_ads: Number(salesReport.classifiedAds),
              blog_links: salesReport.blogLinks.trim(),
              ppt_links: salesReport.pptLinks.trim(),
              business_links: (Array.isArray(salesReport.businessListingLinks) ? salesReport.businessListingLinks : []).join("\n").trim(),
              classified_links: (Array.isArray(salesReport.classifiedAdsLinks) ? salesReport.classifiedAdsLinks : []).join("\n").trim(),
              total_calls: Number(salesReport.totalCalls),
              calls_received: Number(salesReport.callsReceived),
              meetings: Number(salesReport.meetings),
              clients_done: Number(salesReport.clientsDone),
              data_extracted_india: Number(salesReport.dataExtractedIndia),
              data_extracted_abroad: Number(salesReport.dataExtractedAbroad),
              mail_sent_b2b: Number(salesReport.mailSentB2B),
              mail_sent_general: Number(salesReport.mailSentGeneral),
              linkedin_post: salesReport.linkedinPost === "yes",
              linkedin_connections: Number(salesReport.linkedinConnections),
              linkedin_messages: Number(salesReport.linkedinMessages),
              linkedin_data_extracted: Number(salesReport.linkedinDataExtraction),
              newspaper_read: salesReport.newspaperRead === "yes",
              newspaper_important_news: salesReport.newspaperImportantNews.trim(),
              group_photos_added: salesReport.groupPhotosAdded,
            }
          : undefined,
      );
      const updateBody = (await updateRes.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        missing_fields?: string[];
        invalid_fields?: { field: string; minimum: number; actual: unknown }[];
        duplicate_links?: { field: string; url: string }[];
      };
      if (!updateRes.ok) {
        const apiErrors = mapApiCheckoutErrors(updateBody);
        if (apiErrors.length > 0) {
          setCheckoutErrors(apiErrors);
          showCheckoutValidationToast(
            apiErrors,
            updateBody.error || "Sales daily report is incomplete",
          );
          return;
        }
        toast.error(updateBody.error || "Could not post daily update. Please try again.");
        return;
      }
      setCheckoutAwaitingFace(true);
      setPendingCheckoutMeta({
        allowOutsideMeeting: outsideMeetingCheckout,
        outsideNote: outsideMeetingNote.trim(),
      });
    }

    setCoDialog(false);
    setShowCheckoutVerifyModal(true);
  };

  const handleCheckoutVerified = (data?: { checkOutAt?: string; totalHours?: number; overtimeHours?: number }) => {
    setShowCheckoutVerifyModal(false);
    setCheckoutAwaitingFace(false);
    const outMs = data?.checkOutAt ? new Date(data.checkOutAt).getTime() : Date.now();
    const workedMsFromApi = typeof data?.totalHours === "number" ? Math.max(0, data.totalHours * 60 * 60 * 1000) : workMs;
    checkOut({ checkOutAt: outMs, workedMsToday: workedMsFromApi });
    if (typeof data?.overtimeHours === "number" && data.overtimeHours > 0) {
      toast.success(`Checked out. Overtime recorded: ${data.overtimeHours.toFixed(1)}h`);
    }
  };

  const quickActions = [
    { label: "Apply Leave", description: "Request casual/sick leave and track approval status.", icon: CalendarDays, to: "/employee/leaves", accent: "icon-3d-sage" },
    { label: "Attendance", description: "See your check-in/out history and daily status.", icon: Clock, to: "/employee/attendance", accent: "icon-3d-peach" },
    { label: "Updates", description: "View daily updates you shared today.", icon: MessageSquare, to: "/employee/updates", accent: "icon-3d-powder" },
    { label: "Profile", description: "Manage your profile and face settings.", icon: User, to: "/profile", accent: "icon-3d-cream" },
  ];

  const completedPct = Math.min(100, Math.round((workMs / FULL_DAY_MS) * 100));
  const weekProgressPct = Math.min(100, Math.round((weekWorkedHours / WEEK_GOAL_HOURS) * 100));

  const checkoutErrorFieldIds = new Set(checkoutErrors.map((error) => error.fieldId));
  const step1Errors = checkoutErrors.filter((error) => error.fieldId === "workNote");
  const step2Errors = checkoutErrors.filter(
    (error) => error.fieldId !== "workNote" && error.fieldId !== "earlyReason",
  );
  const step2UniqueErrors = Array.from(new Map(step2Errors.map((e) => [e.message, e])).values());
  const step3Errors = checkoutErrors.filter((error) => error.fieldId === "earlyReason");

  const postQuickNote = async () => {
    const text = quickNote.trim();
    if (!text || !accessToken) return;
    setQuickNoteSending(true);
    try {
      const res = await updatesPostRequest(accessToken, `• ${text}`);
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(body.error || "Could not save note");
        return;
      }
      setQuickNote("");
      toast.success("Added to your daily log");
    } finally {
      setQuickNoteSending(false);
    }
  };

  return (
    <div className="min-w-0 space-y-6 overflow-x-hidden">
      <CheckInModal open={showVerifyModal} onOpenChange={setShowVerifyModal} onVerified={handleVerified} mode="check-in" />
      <CheckInModal
        open={showCheckoutVerifyModal}
        onOpenChange={handleCheckoutVerifyOpenChange}
        onVerified={handleCheckoutVerified}
        mode="check-out"
        checkoutMeta={pendingCheckoutMeta}
      />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1.5 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ letterSpacing: "-0.5px" }}>
            {greetingLine}, {userFirstName(user?.name)}
          </h1>
          <p className="text-sm text-muted-foreground">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
        </div>
        <div className="hidden sm:flex flex-col items-end gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium tabular-nums">{completedPct}% of your day</span>
          </div>
          {streakDays > 0 && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-warning px-2 py-1 rounded-full bg-warning/10 border border-warning/25">
              <Flame className="h-3.5 w-3.5" />
              <span className="tabular-nums">{streakDays} day punctuality streak</span>
            </div>
          )}
        </div>
      </div>

      {/* Check-in hero card — 3D sage (primary: first thing after greeting) */}
      <Card className="relative overflow-hidden border-0 shadow-3d rounded-3xl min-h-[220px] flex flex-col justify-center">
        <div className="absolute inset-0 bg-sage-3d vtl-animated-mesh" />
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/15 blur-2xl motion-safe:animate-pulse" />
        <div className="absolute -bottom-12 -left-10 w-56 h-56 rounded-full bg-white/10 blur-2xl motion-safe:animate-pulse" />

        <CardContent className="relative p-6 sm:p-8 text-primary-foreground">
          <AnimatePresence mode="wait">
            <motion.div
              key="idle-working"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-6"
            >
              <div>
                <p className="text-sm font-medium uppercase tracking-wider text-primary-foreground/80">
                  {status === "idle"
                    ? "You're off the clock"
                    : status === "on-break"
                      ? "On break"
                      : status === "checked-out"
                        ? "Today's work complete"
                        : hasOvertime
                          ? "Overtime — time worked today"
                          : "Time worked today"}
                </p>
                <motion.p
                  key={`${status}-${hasOvertime}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 text-4xl sm:text-6xl font-bold tabular-nums tracking-tight"
                >
                  {status === "idle" ? formatDuration(0) : formatDuration(workMs)}
                </motion.p>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {hasOvertime ? (
                    <div className="rounded-2xl bg-amber-400/25 border border-amber-200/40 p-3 sm:col-span-2">
                      <p className="text-[11px] uppercase tracking-wider text-primary-foreground/90 font-semibold">Overtime (&gt; 8h)</p>
                      <p className="mt-1 text-2xl sm:text-3xl font-bold tabular-nums tracking-tight">
                        {formatDuration(overtimeMs)}
                      </p>
                      <p className="mt-1 text-xs text-primary-foreground/80">
                        Standard shift complete — extra time is tracked as overtime.
                      </p>
                    </div>
                  ) : null}
                  {!hasOvertime && status !== "idle" && status !== "checked-out" ? (
                    <div className="rounded-2xl bg-white/10 border border-white/15 p-3">
                      <p className="text-[11px] uppercase tracking-wider text-primary-foreground/75">Remaining</p>
                      <p className="mt-1 text-2xl sm:text-3xl font-bold tabular-nums tracking-tight">
                        {formatDuration(remainingDisplayMs)}
                      </p>
                    </div>
                  ) : null}
                  <div className={cn("rounded-2xl bg-white/10 border border-white/15 p-3", hasOvertime && status !== "idle" && status !== "checked-out" ? "" : !hasOvertime ? "" : "sm:col-span-2")}>
                    <p className="text-[11px] uppercase tracking-wider text-primary-foreground/75">Break taken</p>
                    <p className="mt-1 text-2xl sm:text-3xl font-bold tabular-nums tracking-tight">
                      {formatDuration(breakTakenMs)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  <div>
                    <div className="flex items-center justify-between text-xs text-primary-foreground/80">
                      <span>Work progress</span>
                      <span className="font-semibold">{completedPct}%</span>
                    </div>
                    <div className="h-2 mt-1 rounded-full bg-white/15 overflow-hidden">
                      <div className="h-full bg-sage-3d" style={{ width: `${completedPct}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-xs text-primary-foreground/80">
                      <span>Break time</span>
                      <span className="font-semibold">{breakProgressPct}%</span>
                    </div>
                    <div className="h-2 mt-1 rounded-full bg-white/15 overflow-hidden">
                      <div className="h-full bg-peach-3d" style={{ width: `${breakProgressPct}%` }} />
                    </div>
                  </div>
                </div>

                {status !== "idle" && status !== "checked-out" && (
                  <p className="mt-2 text-sm text-primary-foreground/85">
                    Checked in at {formatTimestampMs(checkInAt!, "h:mm a")} · {breaks.length} breaks taken
                  </p>
                )}
                {status === "checked-in" && onCallMode && (
                  <p className="mt-2 text-sm font-medium text-primary-foreground flex items-center gap-1.5">
                    <Phone className="h-4 w-4 shrink-0" />
                    On a call — auto-break paused (PC idle is ignored)
                  </p>
                )}
                {status === "on-break" && (
                  <p className="mt-2 text-sm font-medium text-primary-foreground/90">
                    You are on break — use keyboard or mouse anywhere on your PC to resume after an auto-break, or tap Resume.
                  </p>
                )}
                {status === "checked-out" && (
                  <p className="mt-2 text-sm text-primary-foreground/85">
                    {checkInAt ? formatTimestampMs(checkInAt, "h:mm a") : "—"} - {checkOutAt ? formatTimestampMs(checkOutAt, "h:mm a") : "—"}
                    {" · "}Total {formatDuration(workMs)}
                    {hasOvertime ? ` · Overtime ${formatDuration(overtimeMs)}` : ""}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                {status === "idle" ? (
                  <Button size="lg" onClick={handleCheckIn}
                    className="h-16 px-8 bg-white text-primary hover:bg-white/90 font-semibold shadow-3d animate-pulse-ring rounded-2xl border-0 hover-shine shadow-glow">
                    <Play className="h-5 w-5 mr-2 fill-primary" /> Check In
                  </Button>
                ) : status === "checked-out" ? (
                  <div className="h-14 px-6 rounded-2xl bg-white/20 text-white border border-white/30 font-semibold backdrop-blur flex items-center">
                    <CheckCircle2 className="h-5 w-5 mr-2" /> Checked out for today
                  </div>
                ) : (
                  <div className="flex w-full min-w-0 flex-col gap-2">
                    <div className="flex flex-wrap gap-3">
                      <Button
                        size="lg"
                        onClick={handleBreak}
                        className={cn(
                          "h-14 px-6 bg-white/20 hover:bg-white/30 text-white border border-white/30 font-semibold backdrop-blur rounded-2xl hover-shine hover:scale-[1.02]",
                          status === "on-break" && "vtl-pulse-soft ring-2 ring-white/40",
                        )}
                      >
                        {status === "on-break" ? (
                          <>
                            <Play className="h-5 w-5 mr-2" /> Resume
                          </>
                        ) : (
                          <>
                            <Coffee className="h-5 w-5 mr-2" /> Break
                          </>
                        )}
                      </Button>
                      {userHasRole(user, "sales") && status === "checked-in" && (
                        <Button
                          size="lg"
                          type="button"
                          onClick={toggleOnCallMode}
                          className={cn(
                            "h-14 px-6 font-semibold backdrop-blur rounded-2xl hover-shine hover:scale-[1.02] border",
                            onCallMode
                              ? "bg-amber-400/90 text-amber-950 border-amber-200 hover:bg-amber-300/90 ring-2 ring-amber-200/60"
                              : "bg-white/20 hover:bg-white/30 text-white border-white/30",
                          )}
                        >
                          <Phone className="h-5 w-5 mr-2" />
                          {onCallMode ? "End call" : "On a call"}
                        </Button>
                      )}
                      <Button
                        size="lg"
                        onClick={openCheckout}
                        className="h-14 px-6 bg-destructive hover:bg-destructive/90 font-semibold shadow-3d rounded-2xl hover-shine hover:scale-[1.02]"
                      >
                        <Square className="h-5 w-5 mr-2 fill-current" /> Check Out
                      </Button>
                    </div>
                    {status === "on-break" && breakStartAt ? (
                      <p className="text-xs text-primary-foreground/85 leading-snug">
                        Auto-resumes in{" "}
                        <span className="font-semibold tabular-nums">{formatDuration(breakAutoResumeInMs)}</span>
                        {" "}(max 1 hour break)
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="soft-3d border-0 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Leave balance</CardTitle>
            <p className="text-xs text-muted-foreground">Casual · Sick · Paid</p>
          </CardHeader>
          <CardContent>
            {leaveBalanceLoading ? (
              <div className="flex justify-center py-4 gap-8">
                <Skeleton className="h-[76px] w-[76px] rounded-full" />
                <Skeleton className="h-[76px] w-[76px] rounded-full hidden sm:block" />
                <Skeleton className="h-[76px] w-[76px] rounded-full hidden sm:block" />
              </div>
            ) : (
              <LeaveBalanceRings balance={leaveBalance} />
            )}
            <Button variant="ghost" size="sm" className="w-full mt-2 text-xs rounded-xl" asChild>
              <Link to="/employee/leaves">View leave history</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="soft-3d border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">This week&apos;s hours</CardTitle>
            <p className="text-xs text-muted-foreground">Goal {WEEK_GOAL_HOURS}h (Mon–Sun)</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-3xl font-bold tabular-nums tracking-tight">{weekWorkedHours}h</span>
              <span className="text-sm text-muted-foreground tabular-nums">/ {WEEK_GOAL_HOURS}h</span>
            </div>
            <div className="h-2.5 rounded-full bg-muted overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-400"
                initial={{ width: 0 }}
                animate={{ width: `${weekProgressPct}%` }}
                transition={{ type: "spring", stiffness: 120, damping: 18 }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{weekProgressPct}% of weekly goal logged.</p>
          </CardContent>
        </Card>

        <Card className="soft-3d border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Quick log</CardTitle>
            <p className="text-xs text-muted-foreground">Add a bullet to your daily updates anytime</p>
          </CardHeader>
          <CardContent className="space-y-2">
            <Textarea
              value={quickNote}
              onChange={(e) => setQuickNote(e.target.value)}
              placeholder="Shipped feature X, blocked on Y…"
              className="min-h-[72px] rounded-2xl text-sm"
              disabled={quickNoteSending}
            />
            <Button
              type="button"
              size="sm"
              className="w-full rounded-xl"
              disabled={!quickNote.trim() || quickNoteSending}
              onClick={() => void postQuickNote()}
            >
              {quickNoteSending ? "Saving…" : "Add to daily log"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {showHowToUse && (
        <Card className="soft-3d border-0 hover-shine">
          <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start gap-3">
            <div className="h-10 w-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">How to use</p>
              <p className="text-xs text-muted-foreground mt-1">
                1) Tap <b>Check In</b> (Face + GPS). 2) Tap <b>Break</b> / <b>Resume</b> — breaks auto-resume after 1 hour. 3) Tap <b>Check Out</b> when done.
              </p>
            </div>
            <Button size="sm" className="hover-shine" onClick={() => setShowHowToUse(false)} type="button">
              Got it
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Quick actions — peach + powder + sage 3D */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
        {pendingApprovals > 0 && (
          <Link to="/employee/leaves" className="col-span-2 lg:col-span-4">
            <Card className="border-0 shadow-lg text-white hover:-translate-y-1 transition-smooth cursor-pointer mb-1 border-glow-shine" style={{ background: "var(--gradient-success)" }}>
              <CardContent className="p-4 flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center bg-white/20 backdrop-blur-sm">
                    <CheckCircle2 className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">You have {pendingApprovals} pending approval{pendingApprovals > 1 ? "s" : ""}</p>
                    <p className="text-xs text-white/80">Your leave requests are currently under review.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        )}
        {quickActions.map((qa, i) => (
          <Link to={qa.to} key={qa.label}>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              <Card className="soft-3d border-0 p-5 hover:-translate-y-1 transition-smooth cursor-pointer h-full hover-shine">
                <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center mb-3", qa.accent)}>
                  <qa.icon className={cn("h-5 w-5", qa.accent === "icon-3d-sage" ? "text-primary-foreground" : "text-foreground/80")} />
                </div>
                <p className="font-semibold text-sm">{qa.label}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-snug">{qa.description}</p>
              </Card>
            </motion.div>
          </Link>
        ))}
      </div>

      {/* Break history */}
      <Card className="card-3d border-0">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Pause className="h-4 w-4" /> Break history</CardTitle>
          <span className="text-xs text-muted-foreground">Total: {formatDuration(totalBreakMs + currentBreak)}</span>
        </CardHeader>
        <CardContent>
          {breaks.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No breaks yet today.</p>
          ) : (
            <div className="space-y-2">
              {[...breaks].sort((a, b) => a.start - b.start).map((b, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-2xl bg-muted/40 border border-border">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-peach-3d shadow-sm flex items-center justify-center">
                      <Coffee className="h-4 w-4 text-foreground/80" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Break #{i + 1}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatTimestampMs(b.start, "h:mm a")} – {formatTimestampMs(b.end, "h:mm a")}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{formatDuration(b.end - b.start)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Smart checkout dialog */}
      <Dialog open={coDialog} onOpenChange={setCoDialog}>
        <DialogContent className="max-w-[min(100%,480px)] rounded-2xl sm:rounded-3xl">
          <DialogHeader className="min-w-0 pr-8 text-left">
            <DialogTitle className="flex flex-wrap items-center gap-2 text-base sm:text-lg">
              <Square className="h-5 w-5 shrink-0 text-primary" /> Wrap up your day
            </DialogTitle>
            <DialogDescription className="text-left break-words">
              Worked {formatDuration(workMs)} today · {completedPct}% of an 8h day
            </DialogDescription>
          </DialogHeader>

          <div className="min-w-0 space-y-4 py-1">
            {checkoutErrors.length > 0 && (
              <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-3 sm:p-3.5">
                <p className="text-sm font-semibold text-destructive">
                  Cannot check out yet. Please follow these steps:
                </p>
                <div className="mt-2 max-h-44 space-y-2 overflow-y-auto">
                  <div className="rounded-lg border border-destructive/30 bg-background/30 p-2">
                    <p className="text-xs font-semibold text-destructive/95">Step 1: Daily update</p>
                    {step1Errors.length === 0 ? (
                      <p className="text-xs text-emerald-300">Done</p>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {step1Errors.map((error, index) => (
                          <li key={`${error.fieldId}-${index}`} className="text-xs leading-relaxed text-destructive/90">
                            - {error.message}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="rounded-lg border border-destructive/30 bg-background/30 p-2">
                    <p className="text-xs font-semibold text-destructive/95">Step 2: Sales/BDE report</p>
                    {step2Errors.length === 0 ? (
                      <p className="text-xs text-emerald-300">Done</p>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {step2UniqueErrors.map((error, index) => (
                          <li key={`${error.fieldId}-${index}`} className="text-xs leading-relaxed text-destructive/90">
                            - {error.message}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="rounded-lg border border-destructive/30 bg-background/30 p-2">
                    <p className="text-xs font-semibold text-destructive/95">Step 3: Early check-out reason</p>
                    {step3Errors.length === 0 ? (
                      <p className="text-xs text-emerald-300">Done</p>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {step3Errors.map((error, index) => (
                          <li key={`${error.fieldId}-${index}`} className="text-xs leading-relaxed text-destructive/90">
                            - {error.message}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}

            {isEarly && (
              <div className="flex min-w-0 gap-2.5 rounded-2xl border border-warning/40 bg-warning/10 p-3 sm:gap-3 sm:p-3.5">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-warning-foreground">Early check-out</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    You haven&apos;t completed 8 hours yet. Please share a reason below.
                  </p>
                </div>
              </div>
            )}

            <div className="min-w-0 space-y-1.5">
              <Label className="text-sm">Daily update <span className="text-destructive">*</span></Label>
              <Textarea
                value={workNote}
                onChange={(e) => {
                  setWorkNote(e.target.value);
                  if (checkoutErrorFieldIds.has("workNote")) {
                    setCheckoutErrors((prev) => prev.filter((error) => error.fieldId !== "workNote"));
                  }
                }}
                placeholder="Write your daily update (tasks completed, blockers, next steps)..."
                className={cn(
                  "min-h-[90px] w-full min-w-0 resize-none rounded-2xl",
                  checkoutErrorFieldIds.has("workNote") && "border-destructive ring-1 ring-destructive/50",
                )}
              />
              <p className="text-[11px] leading-snug text-muted-foreground">This will also post to the Daily Updates feed.</p>
            </div>

            <div className="min-w-0 space-y-2 rounded-2xl border border-border/70 bg-muted/20 p-3">
              <Label className="text-sm">Checkout location type</Label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setOutsideMeetingCheckout(false)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs transition-colors",
                    !outsideMeetingCheckout
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-muted/50 hover:bg-muted",
                  )}
                >
                  Office checkout
                </button>
                <button
                  type="button"
                  onClick={() => setOutsideMeetingCheckout(true)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs transition-colors",
                    outsideMeetingCheckout
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-muted/50 hover:bg-muted",
                  )}
                >
                  Outside client meeting (direct home)
                </button>
              </div>
              {outsideMeetingCheckout ? (
                <div className="space-y-1.5">
                  <Label className="text-[11px] leading-snug">
                    Client meeting note <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    value={outsideMeetingNote}
                    onChange={(e) => setOutsideMeetingNote(e.target.value)}
                    placeholder="Client name, location, short meeting summary..."
                    className="min-h-[70px] w-full min-w-0 resize-none rounded-xl text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Office radius check will be skipped for this checkout.
                  </p>
                </div>
              ) : null}
            </div>

            {userHasRole(user, "sales") && (
              <div className="min-w-0 space-y-3 rounded-2xl border border-border/80 bg-muted/20 p-3 sm:p-4">
                <p className="text-xs font-semibold text-foreground">
                  Sales/BDE compulsory daily report (all fields required)
                </p>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {SALES_REPORT_FIELD_META.map((field) => (
                    <div key={field.key} className={cn("space-y-1.5", field.key.endsWith("Links") ? "sm:col-span-2" : "")}>
                      <Label className="text-[11px] leading-snug">
                        {field.label} <span className="text-destructive">*</span>
                      </Label>
                      {field.key === "businessListingLinks" || field.key === "classifiedAdsLinks" ? (
                        <div className={cn(
                          "rounded-xl border border-border bg-background/40 p-2 space-y-2",
                          checkoutErrorFieldIds.has(field.key) && "border-destructive ring-1 ring-destructive/50",
                        )}>
                          <p className="text-[11px] text-muted-foreground">
                            Add exactly 5 links (each must start with http/https)
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {((salesReport[field.key] as unknown as string[]) || ["", "", "", "", ""]).slice(0, 5).map((val, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <span className="text-[11px] text-muted-foreground w-5">{idx + 1}.</span>
                                <input
                                  type="url"
                                  value={val}
                                  onChange={(e) => {
                                    const next = e.target.value;
                                    setSalesReport((prev) => {
                                      const arr = Array.isArray(prev[field.key])
                                        ? ([...prev[field.key]] as string[])
                                        : ["", "", "", "", ""];
                                      while (arr.length < 5) arr.push("");
                                      arr[idx] = next;
                                      return { ...prev, [field.key]: arr } as SalesDailyReport;
                                    });
                                    if (checkoutErrorFieldIds.has(field.key)) {
                                      setCheckoutErrors((prev) => prev.filter((error) => error.fieldId !== field.key));
                                    }
                                  }}
                                  placeholder={field.placeholder}
                                  className="flex h-9 w-full rounded-xl border border-input bg-background px-3 py-1 text-xs shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : field.key.endsWith("Links") ? (
                        <Textarea
                          value={salesReport[field.key] as unknown as string}
                          onChange={(e) => {
                            const value = e.target.value;
                            setSalesReport((prev) => ({ ...prev, [field.key]: value }));
                            if (checkoutErrorFieldIds.has(field.key)) {
                              setCheckoutErrors((prev) => prev.filter((error) => error.fieldId !== field.key));
                            }
                          }}
                          placeholder={field.placeholder}
                          className={cn(
                            "min-h-[68px] w-full min-w-0 resize-none rounded-xl text-xs",
                            checkoutErrorFieldIds.has(field.key) && "border-destructive ring-1 ring-destructive/50",
                          )}
                        />
                      ) : (
                        <input
                          type="number"
                          min={0}
                          value={salesReport[field.key]}
                          onChange={(e) => {
                            const value = e.target.value;
                            setSalesReport((prev) => ({ ...prev, [field.key]: value }));
                            if (checkoutErrorFieldIds.has(field.key)) {
                              setCheckoutErrors((prev) => prev.filter((error) => error.fieldId !== field.key));
                            }
                          }}
                          placeholder={field.placeholder}
                          className={cn(
                            "flex h-9 w-full rounded-xl border border-input bg-background px-3 py-1 text-xs shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                            checkoutErrorFieldIds.has(field.key) && "border-destructive ring-1 ring-destructive/50",
                          )}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {userHasRole(user, "sales") && (
              <div className="min-w-0 space-y-3 rounded-2xl border border-border/80 bg-muted/20 p-3 sm:p-4">
                <p className="text-xs font-semibold text-foreground">LinkedIn report</p>

                <div className="space-y-1.5">
                  <Label className="text-[11px] leading-snug">LinkedIn post today? <span className="text-destructive">*</span></Label>
                  <div className="flex flex-wrap gap-2">
                    {(["yes", "no"] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => {
                          setSalesReport((prev) => ({ ...prev, linkedinPost: v }));
                          if (checkoutErrorFieldIds.has("linkedinPost")) {
                            setCheckoutErrors((prev) => prev.filter((e) => e.fieldId !== "linkedinPost"));
                          }
                        }}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs transition-colors",
                          salesReport.linkedinPost === v
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-muted/50 hover:bg-muted",
                          checkoutErrorFieldIds.has("linkedinPost") && "border-destructive",
                        )}
                      >
                        {v.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] leading-snug">Connections <span className="text-destructive">*</span></Label>
                    <input
                      type="number"
                      min={0}
                      value={salesReport.linkedinConnections}
                      onChange={(e) => {
                        setSalesReport((prev) => ({ ...prev, linkedinConnections: e.target.value }));
                        if (checkoutErrorFieldIds.has("linkedinConnections")) {
                          setCheckoutErrors((prev) => prev.filter((err) => err.fieldId !== "linkedinConnections"));
                        }
                      }}
                      placeholder="e.g. 30"
                      className={cn(
                        "flex h-9 w-full rounded-xl border border-input bg-background px-3 py-1 text-xs shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        checkoutErrorFieldIds.has("linkedinConnections") && "border-destructive ring-1 ring-destructive/50",
                      )}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] leading-snug">Messages sent <span className="text-destructive">*</span> <span className="text-muted-foreground">(min 100)</span></Label>
                    <input
                      type="number"
                      min={0}
                      value={salesReport.linkedinMessages}
                      onChange={(e) => {
                        setSalesReport((prev) => ({ ...prev, linkedinMessages: e.target.value }));
                        if (checkoutErrorFieldIds.has("linkedinMessages")) {
                          setCheckoutErrors((prev) => prev.filter((err) => err.fieldId !== "linkedinMessages"));
                        }
                      }}
                      placeholder="e.g. 120"
                      className={cn(
                        "flex h-9 w-full rounded-xl border border-input bg-background px-3 py-1 text-xs shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        checkoutErrorFieldIds.has("linkedinMessages") && "border-destructive ring-1 ring-destructive/50",
                      )}
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-[11px] leading-snug">Data extracted <span className="text-destructive">*</span> <span className="text-muted-foreground">(min 25)</span></Label>
                    <input
                      type="number"
                      min={0}
                      value={salesReport.linkedinDataExtraction}
                      onChange={(e) => {
                        setSalesReport((prev) => ({ ...prev, linkedinDataExtraction: e.target.value }));
                        if (checkoutErrorFieldIds.has("linkedinDataExtraction")) {
                          setCheckoutErrors((prev) => prev.filter((err) => err.fieldId !== "linkedinDataExtraction"));
                        }
                      }}
                      placeholder="e.g. 30"
                      className={cn(
                        "flex h-9 w-full rounded-xl border border-input bg-background px-3 py-1 text-xs shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        checkoutErrorFieldIds.has("linkedinDataExtraction") && "border-destructive ring-1 ring-destructive/50",
                      )}
                    />
                  </div>
                </div>
              </div>
            )}

            {userHasRole(user, "sales") && (
              <div className="min-w-0 space-y-3 rounded-2xl border border-border/80 bg-muted/20 p-3 sm:p-4">
                <p className="text-xs font-semibold text-foreground">Newspaper task</p>

                <div className="space-y-1.5">
                  <Label className="text-[11px] leading-snug">Did you read newspaper today? <span className="text-destructive">*</span></Label>
                  <div className="flex flex-wrap gap-2">
                    {(["yes", "no"] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => {
                          setSalesReport((prev) => ({ ...prev, newspaperRead: v }));
                          if (checkoutErrorFieldIds.has("newspaperRead")) {
                            setCheckoutErrors((prev) => prev.filter((e) => e.fieldId !== "newspaperRead"));
                          }
                        }}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs transition-colors",
                          salesReport.newspaperRead === v
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-muted/50 hover:bg-muted",
                          checkoutErrorFieldIds.has("newspaperRead") && "border-destructive",
                        )}
                      >
                        {v.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[11px] leading-snug">Important news <span className={cn(salesReport.newspaperRead === "yes" ? "text-destructive" : "text-muted-foreground")}>*</span></Label>
                  <Textarea
                    value={salesReport.newspaperImportantNews}
                    onChange={(e) => {
                      setSalesReport((prev) => ({ ...prev, newspaperImportantNews: e.target.value }));
                      if (checkoutErrorFieldIds.has("newspaperImportantNews")) {
                        setCheckoutErrors((prev) => prev.filter((err) => err.fieldId !== "newspaperImportantNews"));
                      }
                    }}
                    placeholder="Write 2–5 key points you read today..."
                    className={cn(
                      "min-h-[68px] w-full min-w-0 resize-none rounded-xl text-xs",
                      checkoutErrorFieldIds.has("newspaperImportantNews") && "border-destructive ring-1 ring-destructive/50",
                    )}
                  />
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    Required only when you select YES.
                  </p>
                </div>
              </div>
            )}

            {userHasRole(user, "sales") && (
              <div
                className={cn(
                  "min-w-0 space-y-2 rounded-2xl border border-border/80 bg-muted/20 p-3 sm:p-4",
                  checkoutErrorFieldIds.has("groupPhotosAdded") && "border-destructive ring-1 ring-destructive/50",
                )}
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="groupPhotosAdded"
                    checked={salesReport.groupPhotosAdded}
                    onCheckedChange={(checked) => {
                      const value = checked === true;
                      setSalesReport((prev) => ({ ...prev, groupPhotosAdded: value }));
                      if (checkoutErrorFieldIds.has("groupPhotosAdded")) {
                        setCheckoutErrors((prev) => prev.filter((e) => e.fieldId !== "groupPhotosAdded"));
                      }
                    }}
                  />
                  <div className="space-y-1">
                    <Label htmlFor="groupPhotosAdded" className="text-xs font-medium leading-snug cursor-pointer">
                      Photos added in group <span className="text-destructive">*</span>
                    </Label>
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      Required before check-out — confirm you shared today&apos;s photos in the team group.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {isEarly && (
              <div className="min-w-0 space-y-1.5">
                <Label className="text-sm">Reason for early check-out <span className="text-destructive">*</span></Label>
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {EARLY_REASON_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setEarlyReason(chip)}
                      className={cn(
                        "max-w-full rounded-full border px-2.5 py-1.5 text-[11px] leading-tight transition-colors sm:px-3 sm:text-xs",
                        earlyReason === chip
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-muted/50 hover:bg-muted"
                      )}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
                <Textarea
                  value={earlyReason}
                  onChange={(e) => {
                    setEarlyReason(e.target.value);
                    if (checkoutErrorFieldIds.has("earlyReason")) {
                      setCheckoutErrors((prev) => prev.filter((error) => error.fieldId !== "earlyReason"));
                    }
                  }}
                  placeholder="Doctor appointment, family emergency, half-day approved..."
                  className={cn(
                    "min-h-[70px] w-full min-w-0 resize-none rounded-2xl",
                    checkoutErrorFieldIds.has("earlyReason") && "border-destructive ring-1 ring-destructive/50",
                  )}
                />
              </div>
            )}
          </div>

          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setCoDialog(false)} className="w-full rounded-xl sm:w-auto">
              Cancel
            </Button>
            <Button
              onClick={confirmCheckout}
              className="w-full rounded-xl border-0 bg-sage-3d text-primary-foreground shadow-3d sm:w-auto"
            >
              {checkoutAwaitingFace ? "Continue to face scan" : "Confirm check-out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
