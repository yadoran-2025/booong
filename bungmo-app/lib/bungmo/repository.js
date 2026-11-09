import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch
} from "firebase/firestore";
import { db } from "../firebase.js";
import { BUNGMO_MEETINGS, BUNGMO_USERS } from "./model.js";
import { isLocalPreview, localPreviewStore } from "./local-preview.js";
import { subscribeBooongProfiles } from "./directory.js";
import { normalizeExpenseRows } from "./expense.js";

const users = () => collection(db, BUNGMO_USERS);
const meetings = () => collection(db, BUNGMO_MEETINGS);
const responses = (meetingId) => collection(db, BUNGMO_MEETINGS, meetingId, "responses");
const expenses = (meetingId) => collection(db, BUNGMO_MEETINGS, meetingId, "expenses");
const transferSettlements = (meetingId) => collection(db, BUNGMO_MEETINGS, meetingId, "transferSettlements");
const itinerary = (meetingId) => collection(db, BUNGMO_MEETINGS, meetingId, "itinerary");
const members = (meetingId) => collection(db, BUNGMO_MEETINGS, meetingId, "members");
const expenseReadiness = (meetingId) => collection(db, BUNGMO_MEETINGS, meetingId, "expenseReadiness");
const records = (callback) => (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
const preview = () => isLocalPreview();

export const subscribeProfile = (uid, callback, onError) => preview() ? localPreviewStore.subscribe("users", "", (items) => callback(items.find((item) => item.id === uid) ?? null)) : onSnapshot(
  doc(users(), uid),
  (snapshot) => callback(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null),
  onError
);

export async function ensureProfile(user) {
  const reference = doc(users(), user.uid);
  await runTransaction(db, async transaction => {
    if ((await transaction.get(reference)).exists()) return;
    const name = user.displayName?.trim() || user.email.split("@")[0];
    transaction.set(reference, {
      nickname: Array.from(name).slice(0, 16).join(""),
      email: user.email,
      photoURL: user.photoURL ?? "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });
}

export const subscribeMeetings = (callback, onError) => preview() ? localPreviewStore.subscribe("meetings", "", callback) : onSnapshot(meetings(), records(callback), onError);
export function subscribeUsers(callback, onError) {
  let profiles, legacy;
  const emit = () => { if (profiles && legacy) callback([...profiles, ...legacy]); };
  const stopProfiles = subscribeBooongProfiles(items => { profiles = items; emit(); }, onError);
  const receiveLegacy = items => { legacy = items; emit(); };
  const stopLegacy = preview() ? localPreviewStore.subscribe("users", "", receiveLegacy) : onSnapshot(users(), records(receiveLegacy), onError);
  return () => { stopProfiles(); stopLegacy(); };
}

export async function saveMeeting(meeting, creatorId) {
  const isNew = !meeting.id;
  if (isNew && !creatorId) throw new Error("creatorId is required for a new meeting");
  if (preview()) {
    const id = localPreviewStore.save("meetings", "", isNew ? { ...meeting, creatorId } : meeting);
    return id;
  }
  const { id, ...data } = meeting;
  if (id) {
    await updateDoc(doc(meetings(), id), { ...data, updatedAt: serverTimestamp() });
    return id;
  }
  const reference = await addDoc(meetings(), { ...data, creatorId, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return reference.id;
}

export const deleteMeeting = (meetingId) => preview() ? localPreviewStore.remove("meetings", "", meetingId) : deleteDoc(doc(meetings(), meetingId));

export const subscribeMeetingMembers = (meetingId, callback, onError) => preview() ? localPreviewStore.subscribe("members", meetingId, callback) : onSnapshot(members(meetingId), records(callback), onError);

export async function saveMeetingMember(meetingId, member) {
  if (preview()) {
    if (member.id && localPreviewStore.read("members", meetingId).some(({ id }) => id === member.id)) {
      localPreviewStore.update("members", meetingId, member.id, { active: true });
      return member.id;
    }
    return localPreviewStore.save("members", meetingId, { ...member, active: true });
  }
  const { id, ...data } = member;
  const reference = id ? doc(members(meetingId), id) : doc(members(meetingId));
  if (id && (await getDoc(reference)).exists()) {
    await updateDoc(reference, { active: true, updatedAt: serverTimestamp() });
    return reference.id;
  }
  await setDoc(reference, { ...data, active: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
  return reference.id;
}

export async function deactivateMeetingMember(meetingId, memberId) {
  if (preview()) {
    localPreviewStore.update("members", meetingId, memberId, { active: false });
    return;
  }
  await updateDoc(doc(members(meetingId), memberId), { active: false, updatedAt: serverTimestamp() });
}

export const subscribeResponses = (meetingId, callback, onError) => preview() ? localPreviewStore.subscribe("responses", meetingId, callback) : onSnapshot(responses(meetingId), records(callback), onError);

export const subscribeResponse = (meetingId, uid, callback, onError) => preview() ? localPreviewStore.subscribe("responses", meetingId, (items) => callback(items.find((item) => item.id === uid) ?? null)) : onSnapshot(
  doc(responses(meetingId), uid),
  (snapshot) => callback(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null),
  onError
);

export function saveResponse(meetingId, uid, displayName, availabilityDelta) {
  if (preview()) {
    const current = localPreviewStore.read("responses", meetingId).find((response) => response.id === uid);
    return localPreviewStore.save("responses", meetingId, {
      id: uid,
      displayName,
      availability: { ...(current?.availability ?? {}), ...availabilityDelta }
    });
  }
  return setDoc(
    doc(responses(meetingId), uid),
    { displayName, availability: availabilityDelta, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

export const subscribeExpenses = (meetingId, callback, onError) => preview() ? localPreviewStore.subscribe("expenses", meetingId, callback) : onSnapshot(expenses(meetingId), records(callback), onError);
export const subscribeTransferSettlements = (meetingId, callback, onError) => preview() ? localPreviewStore.subscribe("transferSettlements", meetingId, callback) : onSnapshot(transferSettlements(meetingId), records(callback), onError);
export const subscribeExpenseReadiness = (meetingId, callback, onError) => preview() ? localPreviewStore.subscribe("expenseReadiness", meetingId, callback) : onSnapshot(expenseReadiness(meetingId), records(callback), onError);
export const saveExpenseReadiness = (meetingId, uid, ready, revision) => preview() ? localPreviewStore.save("expenseReadiness", meetingId, { id: uid, ready, revision, updatedAt: new Date() }) : setDoc(doc(expenseReadiness(meetingId), uid), { ready, revision, updatedAt: serverTimestamp() });

export async function saveExpense(meetingId, expense) {
  if (preview()) return localPreviewStore.save("expenses", meetingId, expense);
  const { id, title, payerId, participantIds, amount, settled } = expense;
  const data = { title, payerId, participantIds, amount };
  if (id) {
    await updateDoc(doc(expenses(meetingId), id), { ...data, updatedAt: serverTimestamp() });
    return id;
  }
  const reference = await addDoc(expenses(meetingId), { ...data, settled: settled ?? false, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return reference.id;
}

export async function saveExpenses(meetingId, rows, allowedMemberIds) {
  if (!Array.isArray(allowedMemberIds) || !allowedMemberIds.length) throw new Error("모임 참가자를 확인한 뒤 저장해 주세요.");
  const drafts = normalizeExpenseRows(rows, allowedMemberIds);
  if (preview()) return drafts.map(draft => localPreviewStore.save("expenses", meetingId, { ...draft, settled: false }));
  const batch = writeBatch(db);
  const ids = drafts.map(draft => {
    const reference = doc(expenses(meetingId));
    batch.set(reference, { ...draft, settled: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return reference.id;
  });
  await batch.commit();
  return ids;
}

export const deleteExpense = (meetingId, expenseId) => preview() ? localPreviewStore.remove("expenses", meetingId, expenseId) : deleteDoc(doc(expenses(meetingId), expenseId));
export const updateExpenseSettled = (meetingId, expenseId, settled) => preview() ? localPreviewStore.update("expenses", meetingId, expenseId, { settled }) : updateDoc(
  doc(expenses(meetingId), expenseId), { settled, updatedAt: serverTimestamp() }
);

export function saveTransferSettlement(meetingId, transfer, settled, revision) {
  const id = `${encodeURIComponent(transfer.fromId)}|${encodeURIComponent(transfer.toId)}`;
  const data = { fromId: transfer.fromId, toId: transfer.toId, amount: transfer.amount, revision, settled, updatedAt: serverTimestamp() };
  return preview() ? localPreviewStore.save("transferSettlements", meetingId, { id, ...data }) : setDoc(doc(transferSettlements(meetingId), id), data);
}

export const subscribeItinerary = (meetingId, callback, onError) => preview() ? localPreviewStore.subscribe("itinerary", meetingId, callback) : onSnapshot(itinerary(meetingId), records(callback), onError);

export async function saveItinerary(meetingId, event) {
  if (preview()) return localPreviewStore.save("itinerary", meetingId, event);
  const { id, ...data } = event;
  if (id) {
    await updateDoc(doc(itinerary(meetingId), id), { ...data, updatedAt: serverTimestamp() });
    return id;
  }
  const reference = await addDoc(itinerary(meetingId), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return reference.id;
}

export const deleteItinerary = (meetingId, eventId) => preview() ? localPreviewStore.remove("itinerary", meetingId, eventId) : deleteDoc(doc(itinerary(meetingId), eventId));
