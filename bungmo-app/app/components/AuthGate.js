"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut, signInWithCustomToken } from "firebase/auth";
import { auth, dataAuth } from "../../lib/firebase.js";
import { signInWithGoogle } from "../../lib/bungmo/auth.js";
import { ensureProfile, subscribeProfile } from "../../lib/bungmo/repository.js";
import { isLocalPreview, previewIdentity, isLocalOperator } from "../../lib/bungmo/local-preview.js";
import { openOperatorSession } from "../../lib/bungmo/session.js";

function OperatorLoginScreen({ onLogin, error }) {
  return (
    <main className="auth-screen">
      <section className="auth-card">
        <p className="auth-kicker">붕모</p>
        <h1>모임을 함께 관리해요.</h1>
        <p>BOOONG 운영자 계정으로 이용합니다.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn--primary" type="button" onClick={onLogin}>운영자 로그인</button>
        <a href="/admin.html">← 운영자 공간</a>
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
    let stopped = false;
    const stopAuth = onAuthStateChanged(auth, (nextUser) => {
      const current = ++generation;
      stopProfile();
      stopFocus();
      clearTimeout(timer);
      setUser(null); setProfile(null); setError("");
      if (!nextUser) {
        signOut(dataAuth).catch(() => {});
        setStatus(isLocalOperator() ? "loading" : "ready");
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
          const email = await openOperatorSession(nextUser);
          if (current !== generation) return;
          renewedAt = Date.now();
          if (initial) {
            const identity = { uid: nextUser.uid, email, displayName: nextUser.displayName, photoURL: nextUser.photoURL, bungmoOperator: true };
            await ensureProfile(identity);
            if (current !== generation) return;
            setUser(identity);
            stopProfile = subscribeProfile(nextUser.uid, (nextProfile) => {
              if (current !== generation) return;
              if (!nextProfile) {
                setError("계정 정보를 불러오지 못했어요. 다시 시도해 주세요."); setStatus("error"); return;
              }
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
    if (isLocalOperator()) {
      fetch('/api/bungmo-session', { method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(10000) })
        .then(async response => {
          if (!response.ok) throw new Error('로컬 운영자 세션을 열지 못했어요.');
          const { token } = await response.json();
          if (stopped) return;
          await signInWithCustomToken(auth, token);
        }).catch(error => { if (!stopped) { setError(error.message); setStatus('error'); } });
    }
    return () => { stopped = true; generation++; stopAuth(); stopProfile(); stopFocus(); clearTimeout(timer); };
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
  if (!user) return <OperatorLoginScreen onLogin={login} error={error} />;
  if (!profile) return <main className="auth-screen" aria-busy="true">불러오는 중…</main>;
  return children({ user, profile });
}
