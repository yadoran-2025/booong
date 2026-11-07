import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch
} from "firebase/firestore";
import { db } from "../firebase.js";
import { BUNGMO_MEETINGS, BUNGMO_USERS } from "./model.js";
import { isLocalPreview, localPreviewStore } from "./local-preview.js";

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

export const createProfile = (user, nickname) => preview() ? localPreviewStore.save("users", "", { id: user.uid, nickname, email: user.email, photoURL: user.photoURL ?? "" }) : setDoc(doc(users(), user.uid), {
  nickname,
  email: user.email,
  photoURL: user.photoURL ?? "",
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp()
});

export const updateProfileNickname = (uid, nickname) => preview() ? localPreviewStore.update("users", "", uid, { nickname }) : updateDoc(doc(users(), uid), {
  nickname,
  updatedAt: serverTimestamp()
});

export const updateUserAccess = (uid, active) => preview() ? localPreviewStore.update("users", "", uid, { active }) : updateDoc(doc(users(), uid), {
  active,
  updatedAt: serverTimestamp()
});

export const subscribeMeetings = (callback, onError) => preview() ? localPreviewStore.subscribe("meetings", "", callback) : onSnapshot(meetings(), records(callback), onError);
export const subscribeUsers = (callback, onError) => preview() ? localPreviewStore.subscribe("users", "", callback) : onSnapshot(users(), records(callback), onError);

export async function saveMeeting(meeting, creatorId) {
  const isNew = !meeting.id;
  if (isNew && !creatorId) throw new Error("creatorId is required for a new meeting");
  if (preview()) {
    const id = localPreviewStore.save("meetings", "", isNew ? { ...meeting, creatorId } : meeting);
    if (isNew) localPreviewStore.save("members", id, { id: creatorId, kind: "registered", userId: creatorId, active: true });
    return id;
  }
  const { id, ...data } = meeting;
  if (id) {
    await updateDoc(doc(meetings(), id), { ...data, updatedAt: serverTimestamp() });
    return id;
  }
  const reference = doc(meetings());
  const batch = writeBatch(db);
  batch.set(reference, { ...data, creatorId, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  batch.set(doc(members(reference.id), creatorId), { kind: "registered", userId: creatorId, active: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await batch.commit();
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
