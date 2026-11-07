"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth, dataAuth } from "../../lib/firebase.js";
import { signInWithGoogle, signOutOfBungmo } from "../../lib/bungmo/auth.js";
import { hasBungmoAccess } from "../../lib/bungmo/access.js";
import { createProfile, subscribeProfile } from "../../lib/bungmo/repository.js";
import { isLocalPreview, previewIdentity } from "../../lib/bungmo/local-preview.js";
import { openOperatorSession } from "../../lib/bungmo/session.js";
import NicknameDialog from "./NicknameDialog.js";

function GoogleLoginScreen({ onLogin, error }) {
  const [signingIn, setSigningIn] = useState(false);

  async function login() {
    setSigningIn(true);
    try {
      await onLogin();
    } catch {
      // AuthGate owns the visible failure state after a popup failure.
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <p className="auth-kicker">붕모</p>
        <h1>운영자 계정으로 모임을 관리해요.</h1>
        <button type="button" onClick={login} disabled={signingIn}>
          {signingIn ? "로그인 중…" : "Google로 로그인"}
        </button>
        <p>게스트는 운영자가 모임에 이름으로 추가합니다.</p>{error && <p className="form-error" role="alert">{error}</p>}<a href="/admin.html">← 운영자 공간</a>
      </section>
    </main>
  );
}

function ProfileLoadError({ error }) {
  return (
    <main className="auth-screen">
      <section className="auth-card">
        <p className="auth-kicker">붕모</p>
        <h1>프로필을 불러오지 못했어요.</h1>
        <p className="form-error" role="alert">{error}</p>
        <button type="button" onClick={() => window.location.reload()}>다시 시도</button>
      </section>
    </main>
  );
}

export default function AuthGate({ children }) {
  const [status, setStatus] = useState("loading");
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isLocalPreview()) {
      const { user: previewUser, profile: previewProfile } = previewIdentity();
      setUser(previewUser); setProfile(previewProfile); setStatus("ready");
      return;
    }
    let stopProfile = () => {};
    let stopFocus = () => {};
    let timer;
    let generation = 0;
    const stopAuth = onAuthStateChanged(auth, (nextUser) => {
      const current = ++generation;
      stopProfile();
      stopFocus();
      clearTimeout(timer);
      setUser(null); setProfile(null); setError("");
      if (!nextUser) {
        signOut(dataAuth).catch(() => {});
        setStatus("ready");
        return;
      }
      setStatus("loading");
      let renewing = false;
      let renewedAt = 0;
      async function authorize(initial = false) {
        if (renewing || current !== generation) return;
        renewing = true;
        clearTimeout(timer);
        try {
          await openOperatorSession(nextUser);
          if (current !== generation) return;
          renewedAt = Date.now();
          if (initial) {
            setUser({ uid: nextUser.uid, email: nextUser.email, photoURL: nextUser.photoURL, bungmoOperator: true });
            stopProfile = subscribeProfile(nextUser.uid, (nextProfile) => {
              if (current !== generation) return;
              setProfile(nextProfile); setStatus("ready");
            }, () => {
              if (current !== generation) return;
              setError("프로필을 불러오지 못했어요. 다시 시도해 주세요."); setStatus("error");
            });
          }
          timer = setTimeout(() => authorize(), 45000);
        } catch (error) {
          if (current !== generation) return;
          stopProfile();
          stopFocus();
          await signOut(dataAuth).catch(() => {});
          if (current !== generation) return;
          setUser(null); setProfile(null); setError(error.message); setStatus(error.denied ? "ready" : "error");
        } finally {
          renewing = false;
        }
      }
      const onFocus = () => { if (current === generation && Date.now() - renewedAt > 60000) authorize(); };
      window.addEventListener("focus", onFocus);
      stopFocus = () => window.removeEventListener("focus", onFocus);
      authorize(true);
    }, () => { setError("Google 로그인을 완료하지 못했어요."); setStatus("error"); });
    return () => { generation++; stopAuth(); stopProfile(); stopFocus(); clearTimeout(timer); };
  }, []);

  async function login() {
    setError("");
    try {
      await signInWithGoogle();
    } catch (caughtError) {
      setError("Google 로그인을 완료하지 못했어요. 다시 시도해 주세요.");
      throw caughtError;
    }
  }

  if (status === "loading") return <main className="auth-screen" aria-busy="true">불러오는 중…</main>;
  if (status === "error") return <ProfileLoadError error={error} />;
  if (!user) return <GoogleLoginScreen onLogin={login} error={error} />;
  if (!profile) return <NicknameDialog user={user} onSave={createProfile} />;
  if (!hasBungmoAccess(profile)) return <main className="auth-screen"><section className="auth-card"><p className="auth-kicker">붕모</p><h1>사이트 이용 권한이 꺼져 있어요.</h1><p className="form-error">관리자에게 권한 확인을 요청해 주세요.</p><button type="button" onClick={signOutOfBungmo}>다른 계정으로 로그인</button></section></main>;
  return children({ user, profile });
}
