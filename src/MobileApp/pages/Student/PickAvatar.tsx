import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./PickAvatar.css";
import BearLoading from "../../BearLoading";
import { cancelNativeSpeech, speakKidPrompt } from "../../nativeTts";
import { getFirstName, getRememberedChildFirstName } from "../../../lib/childProgress";
import { getStoredChildAvatar, normalizeChildAvatar, rememberChildAvatar, saveChildAvatar } from "../../../lib/childAvatar";
import { holdChildMusic, releaseChildMusic } from "../../../lib/childMusic";
import { getActiveChild } from "../../../lib/supabaseData";
import { CHILD_AVATARS } from "./childAvatars";

type LocationState = { childId?: string; childFirstName?: string; chooseAvatar?: boolean };

export default function PickAvatar() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as LocationState | null) ?? null;
  const choosing = Boolean(state?.chooseAvatar);
  const childId = state?.childId || localStorage.getItem("activeChildId") || "";
  const remembered = state?.childFirstName || getRememberedChildFirstName(childId);
  const firstName = getFirstName(remembered || "");
  const helloName = firstName && firstName !== "Child" ? firstName : "friend";
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!childId) {
      navigate("/student-access", { replace: true });
      return;
    }

    if (choosing) {
      setSelected(getStoredChildAvatar(childId));
      setReady(true);
      return;
    }

    let active = true;
    let settled = false;
    const finish = (avatarId: string) => {
      if (!active || settled) return;
      settled = true;
      if (avatarId) {
        rememberChildAvatar(childId, avatarId);
        navigate("/student", {
          replace: true,
          state: { childId, childFirstName: remembered || helloName },
        });
        return;
      }
      setReady(true);
    };

    const stored = getStoredChildAvatar(childId);
    if (stored) {
      finish(stored);
      return () => { active = false; };
    }

    const timer = window.setTimeout(() => finish(""), 2500);
    void getActiveChild(childId)
      .then((child) => {
        window.clearTimeout(timer);
        finish(normalizeChildAvatar(child?.avatar));
      })
      .catch(() => {
        window.clearTimeout(timer);
        finish("");
      });

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [childId, choosing, helloName, navigate, remembered]);

  useEffect(() => {
    if (!ready) return;
    holdChildMusic();
    const timer = window.setTimeout(() => {
      speakKidPrompt(`Hi, ${helloName}! Tap the picture you like.`, { interrupt: true });
    }, 400);
    return () => {
      window.clearTimeout(timer);
      cancelNativeSpeech();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      releaseChildMusic();
    };
  }, [ready, helloName]);

  const choose = (avatarId: string, label: string) => {
    setSelected(avatarId);
    speakKidPrompt(label, { interrupt: true });
  };

  const confirm = async () => {
    if (!selected || saving || !childId) return;
    setSaving(true);
    try {
      await saveChildAvatar(childId, selected);
      navigate("/student", {
        replace: true,
        state: { childId, childFirstName: remembered || helloName },
      });
    } finally {
      setSaving(false);
    }
  };

  if (!ready) return <BearLoading />;

  return (
    <div className="pick-avatar">
      <button
        type="button"
        className="pick-avatar-back"
        onClick={() => navigate(choosing ? "/student" : "/student-access", {
          replace: !choosing,
          state: choosing ? { childId, childFirstName: remembered || helloName } : undefined,
        })}
      >
        <span aria-hidden="true">&#8592;</span>
        <span className="pick-avatar-back-label">Back</span>
      </button>

      <header className="pick-avatar-heading">
        <span className="pick-avatar-sparkle" aria-hidden="true">&#10024;</span>
        <h1>Hi, {helloName}!</h1>
        <p>Tap the picture you like.</p>
      </header>

      <div className="pick-avatar-grid" role="listbox" aria-label="Choose an avatar">
        {CHILD_AVATARS.map((avatar) => {
          const isSelected = selected === avatar.id;
          return (
            <button
              key={avatar.id}
              type="button"
              role="option"
              aria-selected={isSelected}
              aria-label={avatar.label}
              className={`pick-avatar-option${isSelected ? " is-selected" : ""}`}
              onClick={() => choose(avatar.id, avatar.label)}
            >
              <img src={avatar.src} alt="" />
              <span>{avatar.label}</span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className="pick-avatar-go"
        disabled={!selected || saving}
        onClick={() => void confirm()}
      >
        {saving ? "Saving\u2026" : "This is me!"}
      </button>
    </div>
  );
}
