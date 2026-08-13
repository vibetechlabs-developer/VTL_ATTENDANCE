import axios from "@/api/axios";


export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "pending" | "in_progress" | "completed" | "reviewed" | "reopened" | "cancelled";

export interface TaskItem {
  id: number;
  title: string;
  description: string;
  assigned_to: number;
  assigned_to_name: string;
  assigned_to_email?: string;
  assigned_to_department: string;

  assigned_by: number;
  assigned_by_name: string;
  assigned_by_email: string;
  priority: TaskPriority;
  status: TaskStatus;
  due_datetime: string;
  completion_notes?: string;
  completed_at?: string;
  is_overdue: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateTaskPayload {
  title: string;
  description?: string;
  assigned_to: number;
  priority: TaskPriority;
  due_datetime: string;
}

export interface UpdateTaskPayload {
  status?: TaskStatus;
  completion_notes?: string;
  due_datetime?: string;
  priority?: TaskPriority;
  title?: string;
  description?: string;
}

export interface AssignableEmployee {
  id: number;
  name: string;
  email: string;
  department: string;
  role: string;
}

export async function fetchAssignableEmployees() {
  return axios.get<AssignableEmployee[]>("/api/updates/tasks/assignable_employees/");
}

export async function fetchTasks(params?: {
  scope?: "mine" | "assigned_by_me" | "all";
  status?: TaskStatus;
  overdue?: "1";
}) {
  return axios.get<TaskItem[]>("/api/updates/tasks/", { params });
}

export async function createTask(payload: CreateTaskPayload) {
  return axios.post<TaskItem>("/api/updates/tasks/", payload);
}

export async function updateTask(id: number, payload: UpdateTaskPayload) {
  return axios.patch<TaskItem>(`/api/updates/tasks/${id}/`, payload);
}

export async function deleteTask(id: number) {
  return axios.delete(`/api/updates/tasks/${id}/`);
}

