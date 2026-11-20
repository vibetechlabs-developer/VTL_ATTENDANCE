import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckSquare, Plus, Clock, AlertTriangle, CheckCircle2,
  Calendar, Search, MoreVertical, ListTodo, Check, AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow, isPast } from "date-fns";

import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

import {
  fetchTasks, createTask, updateTask, deleteTask, fetchAssignableEmployees,
  TaskItem, TaskPriority, TaskStatus, TaskChecklistItem
} from "@/api/tasks";
import { useAuthStore, userHasRole } from "@/store/authStore";

export function parseChecklistAndNotes(
  text: string,
  structuredChecklist?: TaskChecklistItem[]
): { intro: string; items: TaskChecklistItem[] } {
  if (Array.isArray(structuredChecklist) && structuredChecklist.length > 0) {
    return {
      intro: "",
      items: structuredChecklist.map((it, idx) => ({
        id: String(it.id || idx + 1),
        prefix: it.prefix || `${idx + 1}.`,
        text: String(it.text || ""),
        completed: Boolean(it.completed),
      })),
    };
  }

  if (!text || typeof text !== "string") return { intro: "", items: [] };
  const trimmed = text.trim();
  if (!trimmed) return { intro: "", items: [] };

  // 1. Check if it has markdown checkboxes: - [ ] or - [x]
  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const hasMdCheckbox = lines.some((l) => /^(?:[-*]\s*)?\[([ xX])\]\s*(.+)$/.test(l));
  if (hasMdCheckbox) {
    const introLines: string[] = [];
    const items: TaskChecklistItem[] = [];
    let foundFirstItem = false;

    lines.forEach((line) => {
      const match = line.match(/^(?:[-*]\s*)?\[([ xX])\]\s*(.+)$/);
      if (match) {
        foundFirstItem = true;
        items.push({
          id: String(items.length + 1),
          prefix: `${items.length + 1}.`,
          text: match[2].trim(),
          completed: match[1].toLowerCase() === "x",
        });
      } else if (!foundFirstItem && !line.startsWith("-") && !line.startsWith("*")) {
        introLines.push(line);
      } else {
        foundFirstItem = true;
        items.push({
          id: String(items.length + 1),
          prefix: `${items.length + 1}.`,
          text: line.replace(/^[-*•]\s*/, "").trim(),
          completed: false,
        });
      }
    });

    return { intro: introLines.join("\n"), items };
  }

  // 2. Check if numbered list (e.g. '1. ... 2. ...' or multiline '1. ...\n2. ...')
  const numberedMatch = trimmed.match(/(?:^|\s+)\d+[\.\)]\s+/);
  if (numberedMatch) {
    let intro = "";
    let listText = trimmed;
    const firstNumIdx = trimmed.search(/(?:^|\s+)\d+[\.\)]\s+/);
    if (firstNumIdx > 0) {
      intro = trimmed.slice(0, firstNumIdx).trim();
      listText = trimmed.slice(firstNumIdx).trim();
    }

    const parts = listText.split(/(?:^|\s+)(?=\d+[\.\)]\s+)/).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) {
      const items: TaskChecklistItem[] = parts.map((part, idx) => {
        let completed = false;
        let cleanText = part.replace(/^\d+[\.\)]\s*/, "").trim();
        const cbMatch = cleanText.match(/^\[([ xX])\]\s*(.+)$/);
        if (cbMatch) {
          completed = cbMatch[1].toLowerCase() === "x";
          cleanText = cbMatch[2].trim();
        }
        return {
          id: String(idx + 1),
          prefix: `${idx + 1}.`,
          text: cleanText,
          completed,
        };
      });
      return { intro, items };
    }
  }

  // 3. Multiline bullets or lines
  if (lines.length > 1) {
    const items: TaskChecklistItem[] = lines.map((line, idx) => {
      let completed = false;
      let cleanText = line.replace(/^[-*•]\s*/, "").trim();
      const cbMatch = cleanText.match(/^\[([ xX])\]\s*(.+)$/);
      if (cbMatch) {
        completed = cbMatch[1].toLowerCase() === "x";
        cleanText = cbMatch[2].trim();
      }
      return {
        id: String(idx + 1),
        prefix: "•",
        text: cleanText,
        completed,
      };
    });
    return { intro: "", items };
  }

  // Fallback: Not a checklist, just plain text description
  return { intro: trimmed, items: [] };
}

export function serializeChecklistAndNotes(intro: string, items: TaskChecklistItem[]): string {
  const listMd = items
    .map((item) => `- [${item.completed ? "x" : " "}] ${item.text}`)
    .join("\n");
  if (intro && intro.trim()) {
    return `${intro.trim()}\n\n${listMd}`;
  }
  return listMd;
}


export default function TaskManagement() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isSuperAdmin = userHasRole(user, "admin");
  const isManager = userHasRole(user, "manager", "hr");

  const [activeTab, setActiveTab] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  // Create Task Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: "",
    description: "",
    assigned_to: "",
    priority: "medium" as TaskPriority,
    due_date: "",
    due_time: "18:00",
  });

  // Complete Task Modal State
  const [completeTaskId, setCompleteTaskId] = useState<number | null>(null);
  const [completionNotes, setCompletionNotes] = useState("");
  const [incompleteReason, setIncompleteReason] = useState("");

  // Review / Revision Modal State
  const [reviewTaskId, setReviewTaskId] = useState<number | null>(null);
  const [revisionNotes, setRevisionNotes] = useState("");

  // Extend Due Date / Delay Reason Modal State
  const [delayTask, setDelayTask] = useState<TaskItem | null>(null);
  const [delayReason, setDelayReason] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newDueTime, setNewDueTime] = useState("18:00");

  // Fetch employees list for task assignment dropdown
  const { data: employeesData, isLoading: isLoadingEmployees } = useQuery({
    queryKey: ["assignable-employees"],
    queryFn: () => fetchAssignableEmployees().then((res) => res.data),
  });

  const employees = Array.isArray(employeesData) ? employeesData : [];
  const hasSubordinates = employees.length > 0;
  const isManagerOrAdmin = isSuperAdmin || isManager || hasSubordinates;

  // Fetch tasks
  const { data: tasksData, isLoading, error } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => fetchTasks().then((res) => res.data),
  });

  const tasks: TaskItem[] = Array.isArray(tasksData) ? tasksData : [];

  const eligibleExtendTasks = tasks.filter((t) => {
    if (t.status === "completed" || t.status === "reviewed" || t.status === "cancelled") return false;
    if (isManagerOrAdmin) return true;
    return user?.email && t.assigned_to_email ? user.email.toLowerCase() === t.assigned_to_email.toLowerCase() : false;
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Task assigned successfully with timeline deadline!");
      setIsCreateOpen(false);
      setCreateForm({
        title: "",
        description: "",
        assigned_to: "",
        priority: "medium",
        due_date: "",
        due_time: "18:00",
      });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || err.response?.data?.assigned_to || "Failed to assign task.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) => updateTask(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Task status updated!");
      setCompleteTaskId(null);
      setCompletionNotes("");
      setIncompleteReason("");
      setReviewTaskId(null);
      setRevisionNotes("");
      setDelayTask(null);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || "Failed to update task.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Task cancelled / removed.");
    },
  });

  const checklistMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) => updateTask(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (err: any) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.error(err.response?.data?.detail || "Failed to update checklist item.");
    },
  });

  const handleToggleChecklistItem = (task: TaskItem, itemId: string) => {
    const { intro, items } = parseChecklistAndNotes(task.description, task.checklist);
    if (!items.length) return;

    const updatedItems = items.map((it) =>
      it.id === itemId ? { ...it, completed: !it.completed } : it
    );
    const updatedDescription = serializeChecklistAndNotes(intro, updatedItems);
    const allDone = updatedItems.every((it) => it.completed);

    // Optimistically update React Query cache for instant responsive feel
    queryClient.setQueryData(["tasks"], (old: any) => {
      if (!Array.isArray(old)) return old;
      return old.map((t: TaskItem) => {
        if (t.id === task.id) {
          return {
            ...t,
            description: updatedDescription,
            checklist: updatedItems,
            status: t.status === "pending" ? "in_progress" : t.status,
          };
        }
        return t;
      });
    });

    checklistMutation.mutate({
      id: task.id,
      payload: {
        description: updatedDescription,
        checklist: updatedItems,
        ...(task.status === "pending" ? { status: "in_progress" } : {}),
      },
    });

    if (allDone) {
      toast.success("All checklist items completed! Ready to mark completed.", {
        duration: 3000,
      });
    }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.title.trim()) {
      toast.error("Please enter a task title.");
      return;
    }
    if (!createForm.assigned_to) {
      toast.error("Please select an employee to assign task to.");
      return;
    }
    if (!createForm.due_date) {
      toast.error("Please select a completion timeline due date.");
      return;
    }

    const due_datetime = new Date(`${createForm.due_date}T${createForm.due_time}:00`).toISOString();
    const { items: parsedItems } = parseChecklistAndNotes(createForm.description);

    createMutation.mutate({
      title: createForm.title,
      description: createForm.description,
      checklist: parsedItems.length > 0 ? parsedItems : undefined,
      assigned_to: Number(createForm.assigned_to),
      priority: createForm.priority,
      due_datetime,
    });
  };

  const handleCompleteSubmit = () => {
    if (!completeTaskId) return;
    updateMutation.mutate({
      id: completeTaskId,
      payload: {
        status: "completed",
        completion_notes: completionNotes,
        incomplete_reason: incompleteReason,
      },
    });
  };

  const handleExtendDueDate = () => {
    if (!delayTask || !newDueDate) return;
    updateMutation.mutate({
      id: delayTask.id,
      payload: {
        due_datetime: new Date(`${newDueDate}T${newDueTime}:00`).toISOString(),
        incomplete_reason: delayReason,
      },
    });
    setDelayTask(null);
    setDelayReason("");
    setNewDueDate("");
    setNewDueTime("18:00");
  };

  const handleApproveReview = (taskId: number) => {
    updateMutation.mutate({
      id: taskId,
      payload: { status: "reviewed" },
    });
  };

  const handleRequestRevisionSubmit = () => {
    if (!reviewTaskId) return;
    const task = tasks.find(t => t.id === reviewTaskId);
    const existingNotes = task?.completion_notes ? `${task.completion_notes}\n\n[Manager Revision Request]: ${revisionNotes}` : `[Manager Revision Request]: ${revisionNotes}`;

    updateMutation.mutate({
      id: reviewTaskId,
      payload: {
        status: "reopened",
        completion_notes: existingNotes,
      },
    });
  };

  // Filter Tasks logic
  const filteredTasks = tasks.filter((t) => {
    const matchSearch =
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.assigned_to_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchSearch) return false;

    if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;

    if (activeTab === "mine") return t.assigned_to === user?.id || t.assigned_to_email === user?.email;
    if (activeTab === "overdue") return t.is_overdue;
    if (activeTab === "delayed") return Boolean(t.incomplete_reason) && t.status !== "completed" && t.status !== "reviewed";
    if (activeTab === "pending") return t.status === "pending" || t.status === "in_progress" || t.status === "reopened";
    if (activeTab === "completed") return t.status === "completed" || t.status === "reviewed";

    return true;
  });

  // Calculate statistics
  const totalCount = tasks.length;
  const inProgressCount = tasks.filter((t) => t.status === "in_progress" || t.status === "reopened").length;
  const delayedCount = tasks.filter((t) => Boolean(t.incomplete_reason) && t.status !== "completed" && t.status !== "reviewed").length;
  const overdueCount = tasks.filter((t) => t.is_overdue).length;
  const completedCount = tasks.filter((t) => t.status === "completed" || t.status === "reviewed").length;

  const getPriorityBadge = (priority: TaskPriority) => {
    switch (priority) {
      case "urgent":
        return <Badge variant="destructive" className="font-semibold uppercase text-[10px]">Urgent</Badge>;
      case "high":
        return <Badge className="bg-amber-500 hover:bg-amber-600 font-semibold uppercase text-[10px]">High</Badge>;
      case "medium":
        return <Badge variant="secondary" className="font-semibold uppercase text-[10px]">Medium</Badge>;
      case "low":
        return <Badge variant="outline" className="font-semibold uppercase text-[10px]">Low</Badge>;
    }
  };

  const getStatusBadge = (task: TaskItem) => {
    if (task.is_overdue) {
      return (
        <Badge variant="destructive" className="animate-pulse gap-1 font-bold">
          <AlertTriangle className="h-3 w-3" /> Overdue
        </Badge>
      );
    }
    switch (task.status) {
      case "reviewed":
        return <Badge className="bg-purple-600 hover:bg-purple-700 text-white gap-1"><CheckCircle2 className="h-3 w-3" /> Reviewed & Approved</Badge>;
      case "completed":
        return <Badge className="bg-emerald-600 hover:bg-emerald-700 gap-1"><CheckCircle2 className="h-3 w-3" /> Completed</Badge>;
      case "reopened":
        return <Badge className="bg-amber-600 hover:bg-amber-700 text-white gap-1"><Clock className="h-3 w-3" /> Revision Requested</Badge>;
      case "in_progress":
        return <Badge className="bg-blue-600 hover:bg-blue-700 gap-1"><Clock className="h-3 w-3" /> In Progress</Badge>;
      case "pending":
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> Pending</Badge>;
      case "cancelled":
        return <Badge variant="outline">Cancelled</Badge>;
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <CheckSquare className="h-6 w-6 text-primary" /> Task & Timeline Assignment
          </h1>
          <p className="text-sm text-muted-foreground">
            {isManagerOrAdmin
              ? "Assign tasks with target deadlines, monitor completion reports, and review deliverables."
              : "View tasks assigned to you, update timeline progress, and submit completion reports."}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            className="gap-2 border-orange-500/40 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/20 shadow-sm"
            onClick={() => {
              if (eligibleExtendTasks.length > 0) {
                const first = eligibleExtendTasks[0];
                setDelayTask(first);
                setDelayReason(first.incomplete_reason || "");
                if (first.due_datetime) {
                  const d = new Date(first.due_datetime);
                  setNewDueDate(format(d, "yyyy-MM-dd"));
                  setNewDueTime(format(d, "HH:mm"));
                } else {
                  setNewDueDate("");
                  setNewDueTime("18:00");
                }
              } else {
                toast.info("No active tasks available to extend.");
              }
            }}
          >
            <Clock className="h-4 w-4 text-orange-500" /> Extend Due Date
          </Button>

          {isManagerOrAdmin && (
            <Button onClick={() => setIsCreateOpen(true)} className="gap-2 shadow">
              <Plus className="h-4 w-4" /> Assign New Task
            </Button>
          )}
        </div>
      </div>

      {/* Overview Metric Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <Card className="border border-border/40 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase text-muted-foreground">Total Tasks</CardTitle>
            <CheckSquare className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{totalCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Assigned work items</p>
          </CardContent>
        </Card>

        <Card className="border border-border/40 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase text-muted-foreground">In Progress</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{inProgressCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Active / Pending tasks</p>
          </CardContent>
        </Card>

        <Card className="border border-orange-500/30 bg-orange-500/5 dark:bg-orange-950/10 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase text-orange-600 dark:text-orange-400">Delayed / Incomplete</CardTitle>
            <AlertCircle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{delayedCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Timeline extended reasons</p>
          </CardContent>
        </Card>

        <Card className="border border-border/40 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase text-muted-foreground">Overdue Timelines</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{overdueCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Missed deadline targets</p>
          </CardContent>
        </Card>

        <Card className="border border-border/40 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase text-muted-foreground">Completed / Reviewed</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{completedCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Finished & verified tasks</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Board Section */}
      <Card className="border border-border/40 shadow-sm">
        <CardHeader className="pb-4 border-b border-border/40">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full md:w-auto">
              <TabsList className="flex flex-wrap h-auto p-1 gap-1">
                <TabsTrigger value="all">All Tasks ({totalCount})</TabsTrigger>
                <TabsTrigger value="pending">Active ({totalCount - completedCount})</TabsTrigger>
                <TabsTrigger value="delayed" className="text-orange-600 data-[state=active]:text-orange-600 font-semibold gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Delayed / Incomplete ({delayedCount})
                </TabsTrigger>
                <TabsTrigger value="overdue" className="text-red-500 data-[state=active]:text-red-600">
                  Overdue ({overdueCount})
                </TabsTrigger>
                <TabsTrigger value="completed">Completed ({completedCount})</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search task or employee..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 text-xs"
                />
              </div>

              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-[130px] text-xs">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priority</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading tasks...</div>
          ) : filteredTasks.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <CheckSquare className="h-10 w-10 text-muted-foreground/50 mx-auto" />
              <p className="text-sm font-medium text-foreground">No tasks found</p>
              <p className="text-xs text-muted-foreground">
                There are no tasks matching your selected filters.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredTasks.map((task) => {
                const dueDate = new Date(task.due_datetime);
                const isPastDue = isPast(dueDate) && task.status !== "completed" && task.status !== "reviewed";
                const { intro, items } = parseChecklistAndNotes(task.description, task.checklist);
                const pendingChecklistItems = items.filter((it) => !it.completed);

                return (
                  <Card
                    key={task.id}
                    className={`border transition-all hover:shadow-md overflow-hidden flex flex-col justify-between ${
                      task.is_overdue
                        ? "border-red-500/50 bg-red-500/5 dark:bg-red-950/10"
                        : task.incomplete_reason && task.status !== "completed" && task.status !== "reviewed"
                        ? "border-orange-500/50 bg-orange-500/[0.03] dark:bg-orange-950/10"
                        : task.status === "reviewed"
                        ? "border-purple-500/30 bg-purple-500/5"
                        : task.status === "completed"
                        ? "border-emerald-500/30 bg-emerald-500/5"
                        : "border-border/40"
                    }`}
                  >
                    <CardHeader className="p-4 pb-2 flex flex-row items-start justify-between gap-2 space-y-0">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {getPriorityBadge(task.priority)}
                          {getStatusBadge(task)}
                          {task.incomplete_reason && task.status !== "completed" && task.status !== "reviewed" && (
                            <Badge variant="outline" className="border-orange-500/50 text-orange-600 dark:text-orange-400 bg-orange-500/10 gap-1 text-[10px] font-semibold">
                              <AlertCircle className="h-3 w-3" /> Incomplete / Extended
                            </Badge>
                          )}
                        </div>
                        <h3 className="font-semibold text-base text-foreground leading-tight mt-1">
                          {task.title}
                        </h3>
                      </div>

                      {isManagerOrAdmin && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => deleteMutation.mutate(task.id)}
                            >
                              Cancel / Remove Task
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </CardHeader>

                    <CardContent className="p-4 pt-2 space-y-4">
                      {(() => {
                        const { intro, items } = parseChecklistAndNotes(task.description, task.checklist);
                        const isAssignedToMe = user?.email && task.assigned_to_email
                          ? user.email.toLowerCase() === task.assigned_to_email.toLowerCase()
                          : false;
                        const canToggleChecklist = (isAssignedToMe || isManagerOrAdmin) &&
                          task.status !== "completed" && task.status !== "reviewed" && task.status !== "cancelled";

                        const completedCount = items.filter((it) => it.completed).length;
                        const totalItems = items.length;
                        const progressPercent = totalItems > 0 ? Math.round((completedCount / totalItems) * 100) : 0;

                        return (
                          <div className="space-y-3">
                            {/* Intro / context note if present */}
                            {intro && (
                              <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                                {intro}
                              </p>
                            )}

                            {/* Checklist Container */}
                            {totalItems > 0 ? (
                              <div className="rounded-lg border border-border/50 bg-background/60 p-3 space-y-2.5">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                                    <ListTodo className="h-3.5 w-3.5 text-primary" />
                                    <span>Task Checklist</span>
                                  </div>
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "text-[10px] font-mono px-1.5 py-0",
                                      progressPercent === 100
                                        ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 font-bold"
                                        : "text-muted-foreground"
                                    )}
                                  >
                                    {completedCount}/{totalItems} Done ({progressPercent}%)
                                  </Badge>
                                </div>

                                <Progress value={progressPercent} className="h-1.5 bg-muted/60" />

                                <div className="space-y-1.5 pt-1">
                                  {items.map((item) => (
                                    <div
                                      key={item.id}
                                      onClick={() => {
                                        if (canToggleChecklist) {
                                          handleToggleChecklistItem(task, item.id);
                                        }
                                      }}
                                      className={cn(
                                        "flex items-start gap-2.5 p-2 rounded-md transition-all text-xs border",
                                        item.completed
                                          ? "bg-emerald-500/5 border-emerald-500/15 text-muted-foreground"
                                          : task.incomplete_reason
                                          ? "bg-orange-500/10 border-orange-500/30 text-foreground"
                                          : "bg-muted/20 hover:bg-muted/40 border-transparent text-foreground",
                                        canToggleChecklist ? "cursor-pointer" : "cursor-default"
                                      )}
                                    >
                                      <Checkbox
                                        checked={item.completed}
                                        disabled={!canToggleChecklist}
                                        onCheckedChange={() => {
                                          if (canToggleChecklist) {
                                            handleToggleChecklistItem(task, item.id);
                                          }
                                        }}
                                        className={cn(
                                          "mt-0.5 shrink-0 transition-colors",
                                          item.completed && "data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600 text-white"
                                        )}
                                      />
                                      <div className="flex-1 select-none leading-snug">
                                        <div className="flex items-center justify-between gap-1">
                                          <div>
                                            {item.prefix && (
                                              <span className="font-semibold text-muted-foreground mr-1.5">
                                                {item.prefix}
                                              </span>
                                            )}
                                            <span
                                              className={cn(
                                                "transition-all",
                                                item.completed
                                                  ? "line-through text-muted-foreground/75"
                                                  : task.incomplete_reason
                                                  ? "text-orange-950 dark:text-orange-200 font-semibold"
                                                  : "text-foreground font-medium"
                                              )}
                                            >
                                              {item.text}
                                            </span>
                                          </div>
                                          {!item.completed && task.incomplete_reason && (
                                            <Badge variant="outline" className="text-[9px] border-orange-500/40 text-orange-600 bg-orange-500/15 shrink-0 px-1 py-0 font-medium">
                                              Incomplete
                                            </Badge>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>

                                {progressPercent === 100 && (
                                  <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5 pt-1">
                                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                                    <span>All checklist tasks completed! Ready to mark completed.</span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              !intro && task.description && (
                                <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                                  {task.description}
                                </p>
                              )
                            )}
                          </div>
                        );
                      })()}

                      {/* Timeline Deadline Indicator */}
                      <div className="p-2.5 rounded-lg bg-muted/40 border border-border/30 text-xs space-y-1">
                        <div className="flex items-center justify-between font-medium">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <Calendar className="h-3.5 w-3.5" /> Timeline Due:
                          </span>
                          <span className={isPastDue ? "text-red-500 font-bold" : "text-foreground"}>
                            {format(dueDate, "PPP 'at' p")}
                          </span>
                        </div>
                        <div className="text-[11px] text-right font-mono">
                          {task.status === "completed" || task.status === "reviewed" ? (
                            <span className="text-emerald-600 font-semibold">
                              Completed {task.completed_at ? format(new Date(task.completed_at), "PP p") : ""}
                            </span>
                          ) : isPastDue ? (
                            <span className="text-red-600 dark:text-red-400 font-bold">
                              Overdue by {formatDistanceToNow(dueDate)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              Due in {formatDistanceToNow(dueDate)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Show completion notes if submitted */}
                      {task.completion_notes && (
                        <div className="p-2.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20 text-xs text-foreground space-y-1">
                          <span className="font-semibold text-emerald-600 block">Completion Report / Deliverables:</span>
                          <p className="whitespace-pre-line text-muted-foreground leading-relaxed">{task.completion_notes}</p>
                        </div>
                      )}

                      {/* Show incomplete reason with full rich details */}
                      {task.incomplete_reason && (
                        <div className="p-3.5 bg-orange-500/10 dark:bg-orange-950/20 rounded-xl border border-orange-500/30 text-xs space-y-2.5">
                          <div className="flex items-center justify-between gap-2 border-b border-orange-500/20 pb-2">
                            <span className="font-bold text-orange-600 dark:text-orange-400 flex items-center gap-1.5 text-xs">
                              <AlertCircle className="h-4 w-4 shrink-0" />
                              Delayed / Incomplete Task Details
                            </span>
                            <Badge variant="outline" className="text-[10px] border-orange-500/40 text-orange-600 bg-orange-500/15 font-semibold px-2">
                              {pendingChecklistItems.length > 0 ? `${pendingChecklistItems.length} Pending Item${pendingChecklistItems.length > 1 ? "s" : ""}` : "Deadline Extended"}
                            </Badge>
                          </div>

                          {/* 1. Which task / checklist items are incomplete */}
                          <div className="rounded-lg bg-background/80 dark:bg-background/50 border border-orange-500/20 p-2.5 space-y-1">
                            <span className="text-[10px] font-bold text-orange-700 dark:text-orange-400 uppercase tracking-wider block">
                              Incomplete / Unfinished Work:
                            </span>
                            {pendingChecklistItems.length > 0 ? (
                              <div className="space-y-1 pt-0.5">
                                {pendingChecklistItems.map((pi) => (
                                  <div key={pi.id} className="flex items-start gap-1.5 text-foreground font-medium text-xs">
                                    <span className="text-orange-500 font-bold">•</span>
                                    <span>
                                      {pi.prefix ? <span className="font-semibold text-muted-foreground mr-1">{pi.prefix}</span> : null}
                                      {pi.text}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-foreground font-medium text-xs">
                                Task: {task.title} (Incomplete)
                              </p>
                            )}
                          </div>

                          {/* 2. Reason why it did not finish */}
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                              Reason Why Incomplete / Delayed:
                            </span>
                            <p className="whitespace-pre-line text-foreground font-medium bg-background/60 p-2.5 rounded-lg border border-border/40 leading-relaxed text-xs">
                              {task.incomplete_reason}
                            </p>
                          </div>

                          {/* 3. New Due Date & Timeline */}
                          <div className="flex items-center justify-between pt-1 border-t border-orange-500/20 text-xs">
                            <span className="text-muted-foreground">New Target Due Date:</span>
                            <span className="font-bold text-orange-600 dark:text-orange-400">
                              {task.due_datetime ? format(new Date(task.due_datetime), "PPP 'at' p") : "Not set"}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Card Footer: Assignee & Action Buttons */}
                      <div className="pt-3 border-t border-border/40 space-y-2 mt-auto">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-muted-foreground shrink-0">Assigned to:</span>
                            <span className="font-semibold text-foreground truncate">{task.assigned_to_name}</span>
                            <span className="text-muted-foreground/75 text-[11px] shrink-0">({task.assigned_to_department})</span>
                          </div>
                        </div>

                        {/* Employee / Manager Interactive Buttons */}
                        {task.status !== "completed" && task.status !== "reviewed" && task.status !== "cancelled" && (
                          (() => {
                            const isAssignedToMe = user?.email && task.assigned_to_email
                              ? user.email.toLowerCase() === task.assigned_to_email.toLowerCase()
                              : false;

                            const canManage = isAssignedToMe || isManagerOrAdmin;
                            if (!canManage) return null;

                            return (
                              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                                {isAssignedToMe && (task.status === "pending" || task.status === "reopened") && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 text-xs flex-1 min-w-[85px] font-medium"
                                    onClick={() =>
                                      updateMutation.mutate({
                                        id: task.id,
                                        payload: { status: "in_progress" },
                                      })
                                    }
                                  >
                                    Start Task
                                  </Button>
                                )}

                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 text-xs border-orange-500/60 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/25 flex-1 min-w-[125px] font-medium gap-1.5"
                                  onClick={() => {
                                    setDelayTask(task);
                                    setDelayReason(task.incomplete_reason || "");
                                    if (task.due_datetime) {
                                      const d = new Date(task.due_datetime);
                                      setNewDueDate(format(d, "yyyy-MM-dd"));
                                      setNewDueTime(format(d, "HH:mm"));
                                    } else {
                                      setNewDueDate("");
                                      setNewDueTime("18:00");
                                    }
                                  }}
                                >
                                  <Clock className="h-3.5 w-3.5 shrink-0" /> Extend Due Date
                                </Button>

                                {isAssignedToMe && (
                                  <Button
                                    size="sm"
                                    className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white flex-1 min-w-[125px] font-medium gap-1.5 shadow-sm"
                                    onClick={() => {
                                      setCompleteTaskId(task.id);
                                      setCompletionNotes("");
                                      setIncompleteReason("");
                                    }}
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> Mark Completed
                                  </Button>
                                )}
                              </div>
                            );
                          })()
                        )}

                        {/* Manager Review Action Buttons */}
                        {isManagerOrAdmin && task.status === "completed" && (
                          <div className="flex flex-wrap items-center gap-2 pt-0.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs border-amber-500/60 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/25 flex-1 min-w-[110px] font-medium"
                              onClick={() => {
                                setReviewTaskId(task.id);
                                setRevisionNotes("");
                              }}
                            >
                              Request Revision
                            </Button>

                            <Button
                              size="sm"
                              className="h-8 text-xs bg-purple-600 hover:bg-purple-700 text-white flex-1 min-w-[125px] font-medium gap-1.5 shadow-sm"
                              onClick={() => handleApproveReview(task.id)}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> Approve & Review
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Assign Task Modal */}
      {isManagerOrAdmin && (
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckSquare className="h-5 w-5 text-primary" /> Assign Task & Timeline
              </DialogTitle>
              <DialogDescription>
                {isSuperAdmin
                  ? "Assign a work item to any employee, intern, or manager with a target completion deadline."
                  : "Assign a work item to an employee or intern in your team with a target completion deadline."}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateSubmit} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Task Title *</label>
                <Input
                  placeholder="e.g. Daily Outreach & Project Deliverables"
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Assign To *</label>
                <Select
                  value={createForm.assigned_to}
                  onValueChange={(val) => setCreateForm({ ...createForm, assigned_to: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={isLoadingEmployees ? "Loading assignable employees..." : "Select team employee..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {isLoadingEmployees ? (
                      <SelectItem value="__loading__" disabled>Loading...</SelectItem>
                    ) : employees.length === 0 ? (
                      <SelectItem value="__empty__" disabled>No assignable employees found</SelectItem>
                    ) : (
                      employees.map((emp) => (
                        <SelectItem key={emp.id} value={String(emp.id)}>
                          {emp.name} — {emp.department || "General"} ({emp.role})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Priority</label>
                  <Select
                    value={createForm.priority}
                    onValueChange={(val: TaskPriority) => setCreateForm({ ...createForm, priority: val })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Due Time</label>
                  <Input
                    type="time"
                    value={createForm.due_time}
                    onChange={(e) => setCreateForm({ ...createForm, due_time: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Due Date (Timeline Target) *</label>
                <Input
                  type="date"
                  min={new Date().toISOString().split("T")[0]}
                  value={createForm.due_date}
                  onChange={(e) => setCreateForm({ ...createForm, due_date: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground">
                    Description & Checklist Tasks
                  </label>
                  <span className="text-[10px] text-muted-foreground">
                    💡 Numbered (1., 2.) or bullet points turn into checklists
                  </span>
                </div>
                <Textarea
                  placeholder={"Enter task description or numbered checklist items:\n1. First task or milestone\n2. Second task or milestone\n3. Review and final submission"}
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  rows={4}
                />
                {(() => {
                  const preview = parseChecklistAndNotes(createForm.description);
                  if (preview.items.length > 0) {
                    return (
                      <div className="p-2.5 rounded-md bg-muted/40 border border-border/40 text-[11px] space-y-1.5">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                          Checklist Preview ({preview.items.length} items detected):
                        </span>
                        <div className="space-y-1">
                          {preview.items.map((it) => (
                            <div key={it.id} className="flex items-start gap-1.5 text-foreground">
                              <span className="mt-0.5 h-3.5 w-3.5 rounded-sm border border-primary/40 shrink-0" />
                              <span className="leading-snug">{it.prefix} {it.text}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Assigning..." : "Assign Task"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Complete Task Modal */}
      <Dialog open={completeTaskId !== null} onOpenChange={() => setCompleteTaskId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" /> Mark Task as Completed
            </DialogTitle>
            <DialogDescription>
              Submit completion report or notes on work delivered.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <label className="text-xs font-semibold text-foreground">Completion Report / Deliverables Notes *</label>
            <Textarea
              placeholder="Detail work done, links to documents, or comments..."
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              rows={4}
            />
            <div className="space-y-1.5 mt-3">
              <label className="text-xs font-semibold text-foreground">
                If task could not be fully completed — Reason <span className="text-muted-foreground">(optional)</span>
              </label>
              <Textarea
                placeholder="Explain what was incomplete and why..."
                value={incompleteReason}
                onChange={(e) => setIncompleteReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteTaskId(null)}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleCompleteSubmit}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? "Saving..." : "Submit Completion"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request Revision Modal (Manager/Admin) */}
      <Dialog open={reviewTaskId !== null} onOpenChange={() => setReviewTaskId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" /> Request Task Revision
            </DialogTitle>
            <DialogDescription>
              Provide feedback notes to the employee/intern explaining what changes or improvements are needed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <label className="text-xs font-semibold text-foreground">Revision Feedback / Comments *</label>
            <Textarea
              placeholder="Specify missing requirements or additional work requested..."
              value={revisionNotes}
              onChange={(e) => setRevisionNotes(e.target.value)}
              rows={4}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewTaskId(null)}>
              Cancel
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={handleRequestRevisionSubmit}
              disabled={updateMutation.isPending || !revisionNotes.trim()}
            >
              {updateMutation.isPending ? "Submitting..." : "Send Revision Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Extend Due Date Modal */}
      <Dialog open={delayTask !== null} onOpenChange={() => setDelayTask(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600">
              <Clock className="h-5 w-5" /> Extend Task Due Date
            </DialogTitle>
            <DialogDescription>
              Select a task, set a new timeline deadline, and provide an extension reason.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* 1. Task Selection / Dropdown */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground">Select Task to Extend *</label>
                <span className="text-[11px] text-muted-foreground">
                  {eligibleExtendTasks.length} eligible task{eligibleExtendTasks.length !== 1 ? "s" : ""}
                </span>
              </div>
              <Select
                value={delayTask ? String(delayTask.id) : ""}
                onValueChange={(taskIdStr) => {
                  const found = tasks.find((t) => String(t.id) === taskIdStr);
                  if (found) {
                    setDelayTask(found);
                    setDelayReason(found.incomplete_reason || "");
                    if (found.due_datetime) {
                      const d = new Date(found.due_datetime);
                      setNewDueDate(format(d, "yyyy-MM-dd"));
                      setNewDueTime(format(d, "HH:mm"));
                    }
                  }
                }}
              >
                <SelectTrigger className="text-xs font-medium">
                  <SelectValue placeholder="Choose a task to extend..." />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {eligibleExtendTasks.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)} className="text-xs">
                      <span className="font-semibold text-foreground">{t.title}</span>
                      {t.is_overdue && <span className="text-red-500 font-bold ml-1.5">(Overdue)</span>}
                      <span className="text-muted-foreground ml-1.5">· {t.assigned_to_name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 2. Highlighted Selected Task Information Card */}
            {delayTask && (
              <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 dark:bg-orange-950/25 p-3.5 space-y-2.5 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400 block">
                      Target Task Selected
                    </span>
                    <span className="font-bold text-foreground text-sm leading-snug block">
                      {delayTask.title}
                    </span>
                  </div>
                  <div className="flex gap-1 shrink-0 pt-0.5">
                    {getPriorityBadge(delayTask.priority)}
                    {getStatusBadge(delayTask)}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-2 border-t border-orange-500/20">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                    <span className="text-muted-foreground">
                      Current Due:{" "}
                      <strong className={delayTask.is_overdue ? "text-red-600 dark:text-red-400 font-bold" : "text-foreground font-semibold"}>
                        {delayTask.due_datetime ? format(new Date(delayTask.due_datetime), "PP 'at' p") : "Not set"}
                      </strong>
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">
                      Assigned to: <strong className="text-foreground font-semibold">{delayTask.assigned_to_name}</strong>
                    </span>
                  </div>
                </div>

                {/* Incomplete checklist items preview inside extend modal */}
                {(() => {
                  const { items: modalItems } = parseChecklistAndNotes(delayTask.description, delayTask.checklist);
                  const pending = modalItems.filter((it) => !it.completed);
                  if (pending.length > 0) {
                    return (
                      <div className="pt-2 border-t border-orange-500/20 text-xs">
                        <span className="text-[10px] font-bold text-orange-700 dark:text-orange-400 uppercase tracking-wider block mb-1">
                          Incomplete Checklist Items ({pending.length} pending):
                        </span>
                        <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                          {pending.map((p) => (
                            <div key={p.id} className="text-foreground text-[11px] flex items-start gap-1.5 font-medium">
                              <span className="text-orange-500 font-bold">•</span>
                              <span>
                                {p.prefix ? <span className="font-semibold text-muted-foreground mr-1">{p.prefix}</span> : null}
                                {p.text}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            )}

            {/* 3. New Due Date & New Due Time */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">New Due Date *</label>
                <Input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">New Due Time</label>
                <Input
                  type="time"
                  value={newDueTime}
                  onChange={(e) => setNewDueTime(e.target.value)}
                />
              </div>
            </div>

            {/* 4. Reason for Extension */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Reason for Extension <span className="text-muted-foreground">(optional)</span>
              </label>
              <Textarea
                placeholder="Explain why the deadline needs to be extended..."
                value={delayReason}
                onChange={(e) => setDelayReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDelayTask(null)}>
              Cancel
            </Button>
            <Button
              className="bg-orange-600 hover:bg-orange-700 text-white"
              onClick={handleExtendDueDate}
              disabled={updateMutation.isPending || !delayTask || !newDueDate}
            >
              {updateMutation.isPending ? "Saving..." : "Extend Deadline"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
