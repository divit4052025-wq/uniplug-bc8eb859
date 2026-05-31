/**
 * Payments Stage 2 (client): load and open Razorpay Checkout.
 *
 * The Checkout script is loaded lazily (once) from Razorpay's CDN. keyId +
 * orderId + amount come from the server (createBookingOrder) — the client never
 * holds the key as a build-time var, so a test→live swap is a server rotation.
 *
 * The Checkout `handler` success callback only means "the browser thinks payment
 * went through"; it is NEVER the source of truth for confirmation. The booking is
 * confirmed exclusively by the payment.captured webhook (mark_booking_paid). So
 * onSuccess here just refreshes the UI and shows a "processing" message.
 */

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

type RazorpayCtor = new (opts: Record<string, unknown>) => { open: () => void };

declare global {
  interface Window {
    Razorpay?: RazorpayCtor;
  }
}

let loadPromise: Promise<void> | null = null;

function loadCheckoutScript(): Promise<void> {
  if (typeof window !== "undefined" && window.Razorpay) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("checkout_load_failed")));
      return;
    }
    const s = document.createElement("script");
    s.src = CHECKOUT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loadPromise = null;
      reject(new Error("checkout_load_failed"));
    };
    document.body.appendChild(s);
  });
  return loadPromise;
}

export type OpenCheckoutArgs = {
  keyId: string;
  orderId: string;
  amount: number; // paise
  prefill?: { name?: string; email?: string };
  onDismiss: () => void;
  onProcessing: () => void;
};

export async function openRazorpayCheckout(args: OpenCheckoutArgs): Promise<void> {
  await loadCheckoutScript();
  if (typeof window === "undefined" || !window.Razorpay) {
    throw new Error("checkout_unavailable");
  }
  const rzp = new window.Razorpay({
    key: args.keyId,
    order_id: args.orderId,
    amount: args.amount,
    currency: "INR",
    name: "UniPlug",
    description: "Mentorship session",
    prefill: args.prefill ?? {},
    handler: () => {
      // Payment submitted from the browser's POV; the webhook is the real
      // confirmation. Just refresh + show "processing".
      args.onProcessing();
    },
    modal: {
      ondismiss: () => args.onDismiss(),
    },
  });
  rzp.open();
}
