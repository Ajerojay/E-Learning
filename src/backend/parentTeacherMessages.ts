import { classroomTeacherRecipients, sendAppNotifications } from "./appNotifications";
import { sendTeacherAlertSms, type ParentSmsStatus } from "./parentPhone";

export async function sendTeacherSmsMessage(input: {
  parentId: string;
  childId?: string;
  childName?: string;
  message: string;
}): Promise<{ status: ParentSmsStatus; phone: string | null }> {
  const message = input.message.trim();
  if (!message) throw new Error("Write a message for the teacher.");
  const childName = input.childName?.trim();
  await sendAppNotifications({
    recipients: await classroomTeacherRecipients(),
    senderRole: "parent",
    senderId: input.parentId,
    senderName: "Parent",
    childId: input.childId || "",
    childName: childName || null,
    kind: "message",
    title: childName ? `Message from ${childName}'s parent` : "Message from a parent",
    body: message,
  });
  return sendTeacherAlertSms({
    title: childName ? `${childName}'s parent` : "Parent",
    message,
  });
}
