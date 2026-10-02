export type OrderStatus =
  | "pending_payment"
  | "pending_verification"
  | "approved"
  | "rejected"
  | "expired"
  | "cancelled";

export interface Order {
  id: string;
  user_id: string;
  plan_id: string;
  plan_name: string;
  amount?: number;
  total_amount?: number;
  subtotal?: number;
  currency: string;
  status: OrderStatus;
  payment_method: string;
  refund_status?: string;
  refunded_amount?: number;
  mp_payment_status?: string;
  payment_provider?: string;
  paymentProvider?: string;
  mp_checkout_mode?: string;
  mpCheckoutMode?: string;
  checkout_url?: string;
  bank_clabe?: string;
  bank_name?: string;
  bank_account_holder?: string;
  proof_url?: string;
  admin_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateOrderRequest {
  planId: string;
  discountCode?: string;
  paymentMethod: "transfer";
}
