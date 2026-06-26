export type ServiceRequestType =
  | "website"
  | "appointment"
  | "productivity"
  | "consulting"
  | "event_promotion";

export type InquiryType = Exclude<ServiceRequestType, "event_promotion">;

export type ServiceRequestStatus =
  | "pending"
  | "contacted"
  | "closed"
  | "active"
  | "completed";

export type PaymentStatus = "not_required" | "pending" | "paid";

export interface ContactInfo {
  contactName?: string;
  contactEmail: string;
  contactPhone?: string;
  firmName?: string;
}

export interface PromotionPricing {
  days: number;
  dailyRateKobo: number;
  socialAddonKobo: number;
  totalKobo: number;
}

export interface CreateInquiryInput extends ContactInfo {
  type: InquiryType;
  payload: Record<string, any>;
}

export interface CreateEventPromotionInput extends ContactInfo {
  title: string;
  address?: string;
  startAt: string;
  endAt: string;
  shareOnSocial: boolean;
  links?: string[];
  flyer: {
    buffer: Buffer;
    mimetype: string;
    filename: string;
  };
}
