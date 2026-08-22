import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  doc,
  writeBatch,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { db } from "./config";

export type NotificationType =
  | "product_request_submitted"   // customer submits a request → admin sees it
  | "product_request_approved"    // admin approves → customer sees it
  | "product_request_rejected"    // admin rejects → customer sees it
  | "subscription_expiring";      // system → customer sees it

export interface Notification {
  id: string;
  userId: string;          // recipient UID. "admin" means all admins.
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  createdAt: Timestamp | null;
  meta?: Record<string, string>;
}

/* ── Write helpers ─────────────────────────────────────── */

/** Call after a customer submits a product request */
export async function notifyAdminNewRequest(params: {
  requestId: string;
  productName: string;
  category: string;
  requestedByName: string;
  requestedByEmail: string;
}) {
  await addDoc(collection(db, "notifications"), {
    userId: "admin",
    type: "product_request_submitted",
    title: "New Product Request",
    body: `${params.requestedByName} requested "${params.productName}" (${params.category})`,
    read: false,
    createdAt: serverTimestamp(),
    meta: {
      requestId: params.requestId,
      productName: params.productName,
      requestedByEmail: params.requestedByEmail,
    },
  });
}

/** Call after admin approves a product request */
export async function notifyCustomerApproved(params: {
  customerUid: string;
  productName: string;
  requestId: string;
}) {
  await addDoc(collection(db, "notifications"), {
    userId: params.customerUid,
    type: "product_request_approved",
    title: "Product Request Approved ✅",
    body: `Your request for "${params.productName}" has been approved and added to the catalog.`,
    read: false,
    createdAt: serverTimestamp(),
    meta: { requestId: params.requestId, productName: params.productName },
  });
}

/** Call after admin rejects a product request */
export async function notifyCustomerRejected(params: {
  customerUid: string;
  productName: string;
  requestId: string;
  reason?: string;
}) {
  await addDoc(collection(db, "notifications"), {
    userId: params.customerUid,
    type: "product_request_rejected",
    title: "Product Request Declined ❌",
    body:
      `Your request for "${params.productName}" was not approved.` +
      (params.reason ? ` Reason: ${params.reason}` : ""),
    read: false,
    createdAt: serverTimestamp(),
    meta: { requestId: params.requestId, productName: params.productName },
  });
}

/** Call at login/session start for customers about to expire */
export async function notifySubscriptionExpiringSoon(params: {
  customerUid: string;
  daysLeft: number;
}) {
  // Avoid duplicate expiry notifications by checking if one already exists today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const q = query(
    collection(db, "notifications"),
    where("userId", "==", params.customerUid),
    where("type", "==", "subscription_expiring")
  );
  const snap = await getDocs(q);
  const alreadyToday = snap.docs.some((d) => {
    const ts = d.data().createdAt as Timestamp | null;
    if (!ts) return false;
    return ts.toDate() >= today;
  });
  if (alreadyToday) return;

  await addDoc(collection(db, "notifications"), {
    userId: params.customerUid,
    type: "subscription_expiring",
    title: "Subscription Expiring Soon ⚠️",
    body: `Your subscription expires in ${params.daysLeft} day${params.daysLeft === 1 ? "" : "s"}. Renew now to keep uninterrupted access.`,
    read: false,
    createdAt: serverTimestamp(),
    meta: { daysLeft: String(params.daysLeft) },
  });
}

/* ── Read helpers ──────────────────────────────────────── */

/** Subscribe to real-time notifications for a user (or "admin") */
export function subscribeToNotifications(
  userId: string,
  callback: (notifications: Notification[]) => void
) {
  const q = query(
    collection(db, "notifications"),
    where("userId", "==", userId),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(q, (snap) => {
    const notifications: Notification[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<Notification, "id">),
    }));
    callback(notifications);
  });
}

/** Mark a single notification as read */
export async function markNotificationRead(notificationId: string) {
  await updateDoc(doc(db, "notifications", notificationId), { read: true });
}

/** Mark ALL unread notifications for a user as read */
export async function markAllRead(userId: string) {
  const q = query(
    collection(db, "notifications"),
    where("userId", "==", userId),
    where("read", "==", false)
  );
  const snap = await getDocs(q);
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
  await batch.commit();
}
