export interface Response<T = any> {
  error: boolean;
  message: string;
  data?: T;
}

export type Role = "USER" | "PENDING_PROFESSIONAL" | "LAWYER" | "FIRM" | "ADMIN";
export type AccountStatus = "active" | "suspended" | "deleted";
export type VerificationStatus = "pending" | "under_review" | "verified" | "rejected";

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: Pagination;
}

export type NotificationType =
  | "new_request"
  | "request_accepted"
  | "request_declined"
  | "request_expired"
  | "new_message"
  | "review_request"
  | "new_review"
  | "new_follower"
  | "post_liked"
  | "article_published"
  | "verification_update"
  | "system";

export type IntakeBudget =
  | "under_100k"
  | "100k_to_500k"
  | "500k_to_2m"
  | "above_2m";

export type IntakePreference = "lawyer" | "firm" | "either";

export interface IntakePayload {
  matter: string;
  budget: IntakeBudget;
  location: string;
  preference: IntakePreference;
  freeText?: string;
}
