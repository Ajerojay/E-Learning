import { useEffect, useMemo, useState } from "react";
import { Mail, Phone, UserRound } from "lucide-react";
import { type AppNotification } from "../../../backend/appNotifications";
import { formatPhMobileDisplay, getParentPhone } from "../../../backend/parentPhone";
import { useAppNotifications } from "../notifications/useAppNotifications";

function fullTime(value: string) {
  return new Date(value).toLocaleString("en-PH", {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function TeacherParentMessages({
  teacherId,
  focusId,
}: {
  teacherId: string;
  focusId: string | null;
}) {
  const { items, markRead } = useAppNotifications("teacher", teacherId);
  const messages = useMemo(
    () => items.filter(item => item.kind === "message"),
    [items],
  );
  const [selectedId, setSelectedId] = useState<string | null>(focusId);
  const [parentPhone, setParentPhone] = useState("");

  useEffect(() => {
    if (focusId) setSelectedId(focusId);
  }, [focusId]);

  const selected: AppNotification | null =
    messages.find(item => item.id === selectedId) || messages[0] || null;

  useEffect(() => {
    if (selected && !selected.readAt) void markRead(selected.id);
    // markRead is recreated each render; only re-run when the opened notice changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  useEffect(() => {
    let alive = true;
    setParentPhone("");
    if (!selected?.senderId) return;
    void getParentPhone(selected.senderId).then(phone => {
      if (alive) setParentPhone(phone ? formatPhMobileDisplay(phone) : "");
    });
    return () => { alive = false; };
  }, [selected?.id, selected?.senderId]);

  return (
    <>
      <div className="ta-heading">
        <div>
          <span>PARENT COMMUNICATION</span>
          <h1>Parent Messages</h1>
          <p>Open a notification to read the full message a parent sent from the app.</p>
        </div>
      </div>
      {messages.length === 0 ? (
        <section className="ta-card ta-message-empty">
          <Mail />
          <b>No parent messages yet</b>
          <p>When a parent taps Send SMS to teacher, the full note opens here.</p>
        </section>
      ) : (
        <div className="ta-message-layout">
          <section className="ta-card ta-message-list">
            <header>
              <span><Mail /></span>
              <div>
                <h2>Inbox</h2>
                <p>{messages.length} message{messages.length === 1 ? "" : "s"} from parents</p>
              </div>
            </header>
            <div>
              {messages.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className={`ta-message-row${selected?.id === item.id ? " is-open" : ""}${item.readAt ? "" : " unread"}`}
                  onClick={() => setSelectedId(item.id)}
                >
                  <b>{item.title || "Message from a parent"}</b>
                  <small>{fullTime(item.createdAt)}</small>
                  {item.body ? <em>{item.body}</em> : null}
                </button>
              ))}
            </div>
          </section>
          {selected && (
            <article className="ta-card ta-message-detail" id={`ta-parent-message-${selected.id}`}>
              <header>
                <span className="purple"><UserRound /></span>
                <div>
                  <h2>{selected.title || "Parent message"}</h2>
                  <p>{fullTime(selected.createdAt)}</p>
                </div>
              </header>
              <dl>
                <div>
                  <dt>From</dt>
                  <dd>{selected.senderName || "Parent"}{selected.childName ? ` · ${selected.childName}'s parent` : ""}</dd>
                </div>
                {selected.childName ? (
                  <div>
                    <dt>Learner</dt>
                    <dd>{selected.childName}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Parent phone</dt>
                  <dd>{parentPhone || "Not on file"}</dd>
                </div>
              </dl>
              <div className="ta-message-body">
                <small>Message</small>
                <p>{selected.body.trim() || "This notification did not include a written message."}</p>
              </div>
              {parentPhone ? (
                <p className="ta-message-phone"><Phone /> {parentPhone}</p>
              ) : null}
            </article>
          )}
        </div>
      )}
    </>
  );
}
