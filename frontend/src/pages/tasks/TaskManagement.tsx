import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckSquare, Plus, Clock, AlertTriangle, CheckCircle2,
  Calendar, Search, MoreVertical,
} from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow, isPast } from "date-fns";


import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  TaskItem, TaskPriority, TaskStatus
} from "@/api/tasks";
import { useAuthStore, userHasRole } from "@/store/authStore";


export default function TaskManagement() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isSuperAdmin = userHasRole(user, "admin");
  const isManager = userHasRole(user, "manager", "hr");
  const isManagerOrAdmin = isSuperAdmin || isManager;

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

  // Review / Revision Modal State
  const [reviewTaskId, setReviewTaskId] = useState<number | null>(null);
  const [revisionNotes, setRevisionNotes] = useState("");

  // Fetch employees list for task assignment dropdown
  const { data: employeesData, isLoading: isLoadingEmployees } = useQuery({
    queryKey: ["assignable-employees"],
    queryFn: () => fetchAssignableEmployees().then((res) => res.data),
    enabled: isManagerOrAdmin,
  });

  const employees = Array.isArray(employeesData) ? employeesData : [];

  // Fetch tasks
  const { data: tasksData, isLoading, error } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => fetchTasks().then((res) => res.data),
  });

  const tasks: TaskItem[] = Array.isArray(tasksData) ? tasksData : [];

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
      setReviewTaskId(null);
      setRevisionNotes("");
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

    createMutation.mutate({
      title: createForm.title,
      description: createForm.description,
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
      },
    });
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
    if (activeTab === "pending") return t.status === "pending" || t.status === "in_progress" || t.status === "reopened";
    if (activeTab === "completed") return t.status === "completed" || t.status === "reviewed";

    return true;
  });

  // Calculate statistics
  const totalCount = tasks.length;
  const inProgressCount = tasks.filter((t) => t.status === "in_progress" || t.status === "reopened").length;
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
        {isManagerOrAdmin && (
          <Button onClick={() => setIsCreateOpen(true)} className="gap-2 shadow">
            <Plus className="h-4 w-4" /> Assign New Task
          </Button>
        )}
      </div>

      {/* Overview Metric Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
              <TabsList>
                <TabsTrigger value="all">All Tasks ({totalCount})</TabsTrigger>
                <TabsTrigger value="pending">Active ({totalCount - completedCount})</TabsTrigger>
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

                return (
                  <Card
                    key={task.id}
                    className={`border transition-all hover:shadow-md ${
                      task.is_overdue
                        ? "border-red-500/50 bg-red-500/5 dark:bg-red-950/10"
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
                      {task.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {task.description}
                        </p>
                      )}

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

                      {/* Employee Details & Action Buttons */}
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pt-2 border-t border-border/30 text-xs">
                        <div>
                          <span className="text-muted-foreground">Assigned to: </span>
                          <span className="font-semibold text-foreground">{task.assigned_to_name}</span>
                          <span className="text-muted-foreground"> ({task.assigned_to_department})</span>
                        </div>

                        {/* Employee Interactive Buttons */}
                        {task.status !== "completed" && task.status !== "reviewed" && task.status !== "cancelled" && (
                          (() => {
                            const isAssignedToMe = user?.email && task.assigned_to_email
                              ? user.email.toLowerCase() === task.assigned_to_email.toLowerCase()
                              : false;

                            if (!isAssignedToMe) return null;

                            return (
                              <div className="flex gap-2 w-full sm:w-auto">
                                {(task.status === "pending" || task.status === "reopened") && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs w-full sm:w-auto"
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
                                  className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white w-full sm:w-auto gap-1"
                                  onClick={() => {
                                    setCompleteTaskId(task.id);
                                    setCompletionNotes("");
                                  }}
                                >
                                  <CheckCircle2 className="h-3 w-3" /> Mark Completed
                                </Button>
                              </div>
                            );
                          })()
                        )}

                        {/* Manager Review Action Buttons */}
                        {isManagerOrAdmin && task.status === "completed" && (
                          <div className="flex gap-2 w-full sm:w-auto">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs border-amber-500 text-amber-600 hover:bg-amber-50"
                              onClick={() => {
                                setReviewTaskId(task.id);
                                setRevisionNotes("");
                              }}
                            >
                              Request Revision
                            </Button>

                            <Button
                              size="sm"
                              className="h-7 text-xs bg-purple-600 hover:bg-purple-700 text-white gap-1"
                              onClick={() => handleApproveReview(task.id)}
                            >
                              <CheckCircle2 className="h-3 w-3" /> Approve & Review
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* Show completion notes if submitted */}
                      {task.completion_notes && (
                        <div className="p-2 bg-emerald-500/10 rounded border border-emerald-500/20 text-xs text-foreground mt-2">
                          <span className="font-semibold text-emerald-600 block">Completion Report / Deliverables:</span>
                          <span className="whitespace-pre-line">{task.completion_notes}</span>
                        </div>
                      )}
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
                  placeholder="e.g. Prepare Monthly Sales Performance Report"
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
                <label className="text-xs font-semibold text-foreground">Description / Instructions</label>
                <Textarea
                  placeholder="Enter specific instructions or deliverables expected by the deadline..."
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  rows={3}
                />
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
    </div>
  );
}
