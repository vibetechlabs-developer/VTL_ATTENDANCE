// src/pages/ess/TicketDetail.tsx
import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, MessageSquare, Send, CheckCircle2, Paperclip,
  RefreshCw, Clock, AlertCircle, User,
} from "lucide-react";
import {
  fetchTicketDetail, createTicketComment,
  resolveTicket, reopenTicket,
} from "@/api/ess";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useAuthStore, userHasRole } from "@/store/authStore";
import { toast } from "sonner";

function getInitials(name?: string) {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function StatusBadge({ status }: { status: string }) {
  if (status === "resolved")
    return <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white gap-1"><CheckCircle2 className="h-3 w-3" />Resolved</Badge>;
  if (status === "in_progress")
    return <Badge className="bg-blue-600 hover:bg-blue-600 text-white gap-1"><Clock className="h-3 w-3" />In Progress</Badge>;
  return <Badge className="bg-amber-500 hover:bg-amber-500 text-white gap-1"><AlertCircle className="h-3 w-3" />Open</Badge>;
}

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    high: "bg-red-500/10 text-red-600 border-red-500/30",
    medium: "bg-amber-500/10 text-amber-600 border-amber-500/30",
    low: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border capitalize ${colors[priority] || colors.medium}`}>
      {priority}
    </span>
  );
}

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [commentText, setCommentText] = useState("");

  const isHrOrAdmin = userHasRole(user, "admin", "hr");

  const { data: ticket, isLoading, error } = useQuery({
    queryKey: ["ticket", id],
    queryFn: () => fetchTicketDetail(id!).then((res) => res.data),
    enabled: !!id,
  });

  const commentMutation = useMutation({
    mutationFn: (payload: any) => createTicketComment(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket", id] });
      toast.success("Response added to discussion thread");
      setCommentText("");
    },
    onError: (err: any) => {
      const data = err?.response?.data;
      const msg = typeof data === "string" ? data
        : data && typeof data === "object"
        ? Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join(" | ")
        : "Failed to post comment";
      toast.error(msg);
    },
  });

  const resolveMutation = useMutation({
    mutationFn: () => resolveTicket(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      toast.success("Ticket marked as resolved");
    },
    onError: () => toast.error("Failed to resolve ticket"),
  });

  const reopenMutation = useMutation({
    mutationFn: () => reopenTicket(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      toast.success("Ticket reopened for further discussion");
    },
    onError: () => toast.error("Failed to reopen ticket"),
  });

  const handleSubmitComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) {
      toast.error("Please write something before posting");
      return;
    }
    commentMutation.mutate({ ticket: Number(id), text: commentText.trim() });
  };

  if (isLoading) return (
    <div className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
      <RefreshCw className="h-4 w-4 animate-spin" /> Loading ticket details...
    </div>
  );
  if (error || !ticket) return (
    <div className="p-8 text-center text-red-500">Failed to load ticket details.</div>
  );

  const comments = ticket.comments || [];
  const isResolved = ticket.status === "resolved";

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="outline" size="icon" className="shrink-0 mt-0.5" onClick={() => navigate("/tickets")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="space-y-1">
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              {ticket.subject}
            </h1>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground capitalize">
                Category: <span className="text-foreground font-medium">{ticket.category?.replace(/_/g, " ")}</span>
              </span>
              <span className="text-muted-foreground">•</span>
              <PriorityBadge priority={ticket.priority || "medium"} />
              {ticket.assigned_to_name && (
                <>
                  <span className="text-muted-foreground">•</span>
                  <span className="text-xs text-muted-foreground">
                    Assigned to: <span className="text-foreground font-medium">{ticket.assigned_to_name}</span>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Status + Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={ticket.status} />
          {!isResolved && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1 text-emerald-600 border-emerald-600/40 hover:bg-emerald-50 dark:hover:bg-emerald-950"
              onClick={() => resolveMutation.mutate()}
              disabled={resolveMutation.isPending}
            >
              <CheckCircle2 className="h-4 w-4" />
              {resolveMutation.isPending ? "Resolving..." : "Resolve Ticket"}
            </Button>
          )}
          {isResolved && isHrOrAdmin && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1 text-blue-600 border-blue-600/40 hover:bg-blue-50 dark:hover:bg-blue-950"
              onClick={() => reopenMutation.mutate()}
              disabled={reopenMutation.isPending}
            >
              <RefreshCw className="h-4 w-4" />
              {reopenMutation.isPending ? "Reopening..." : "Reopen Ticket"}
            </Button>
          )}
        </div>
      </div>

      {/* Ticket Description Card */}
      <Card className="border border-border/40 shadow-sm">
        <CardHeader className="border-b border-border/40 py-3 px-5">
          <div className="flex justify-between items-center text-xs text-muted-foreground">
            <span>
              Opened by{" "}
              <strong className="text-foreground">{ticket.employee_name || "Unknown"}</strong>
            </span>
            <span>{ticket.created_on ? new Date(ticket.created_on).toLocaleString("en-IN") : ""}</span>
          </div>
        </CardHeader>
        <CardContent className="p-5 space-y-3">
          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
            {ticket.description}
          </p>
          {ticket.attachment && (
            <a
              href={ticket.attachment}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary underline bg-muted/50 px-3 py-1.5 rounded-md"
            >
              <Paperclip className="h-3.5 w-3.5" />
              View Attachment File
            </a>
          )}
        </CardContent>
      </Card>

      {/* Discussion Thread */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold tracking-tight text-foreground flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            Discussion Thread
            {comments.length > 0 && (
              <span className="text-xs font-normal text-muted-foreground">
                ({comments.length} {comments.length === 1 ? "response" : "responses"})
              </span>
            )}
          </h2>
          {isResolved && (
            <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
              Ticket resolved — you can still add notes
            </span>
          )}
        </div>

        {/* Comments List */}
        {comments.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-border/60 rounded-xl space-y-2">
            <MessageSquare className="h-8 w-8 text-muted-foreground/40 mx-auto" />
            <p className="text-sm text-muted-foreground">No responses yet on this ticket.</p>
            <p className="text-xs text-muted-foreground/60">Be the first to respond below.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {comments.map((c: any, idx: number) => {
              const authorName = c.author_name || "Support Member";
              const initials = getInitials(authorName);
              const isOwnComment = user?.name === authorName || user?.email?.split("@")[0] === authorName;
              return (
                <div
                  key={c.id ?? idx}
                  className={`flex gap-3 ${isOwnComment ? "flex-row-reverse" : ""}`}
                >
                  {/* Avatar */}
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    isOwnComment
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {initials}
                  </div>

                  {/* Bubble */}
                  <div className={`flex-1 max-w-[85%] space-y-1 ${isOwnComment ? "items-end" : "items-start"} flex flex-col`}>
                    <div className={`flex items-center gap-2 text-xs ${isOwnComment ? "flex-row-reverse" : ""}`}>
                      <span className="font-semibold text-foreground">{authorName}</span>
                      <span className="text-muted-foreground">
                        {c.created_on ? new Date(c.created_on).toLocaleString("en-IN") : ""}
                      </span>
                    </div>
                    <div className={`px-4 py-2.5 rounded-xl text-sm text-foreground whitespace-pre-wrap leading-relaxed ${
                      isOwnComment
                        ? "bg-primary/10 border border-primary/20 rounded-tr-none"
                        : "bg-muted/50 border border-border/40 rounded-tl-none"
                    }`}>
                      {c.text}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add Comment Form — always visible */}
        <form onSubmit={handleSubmitComment} className="space-y-3 pt-2">
          <div className="flex gap-3 items-start">
            {/* Current user avatar */}
            <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground shrink-0 mt-1">
              {getInitials(user?.name || user?.email)}
            </div>
            <div className="flex-1 space-y-2">
              <Textarea
                rows={3}
                placeholder={isResolved
                  ? "Add a note or follow-up comment on this resolved ticket..."
                  : "Write a response or update on this ticket..."
                }
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                className="resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    handleSubmitComment(e as any);
                  }
                }}
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Ctrl+Enter to send</span>
                <Button type="submit" size="sm" className="gap-2" disabled={commentMutation.isPending}>
                  <Send className="h-3.5 w-3.5" />
                  {commentMutation.isPending ? "Sending..." : "Post Comment"}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
