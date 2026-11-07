"use client";

import { useState } from "react";
import { validateNickname } from "../../lib/bungmo/model.js";

export default function NicknameDialog({ user, onSave }) {
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(event) {
    event.preventDefault();
    try {
      const validNickname = validateNickname(nickname);
      setError("");
      setSaving(true);
      await onSave(user, validNickname);
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="auth-screen">
      <form className="auth-card" onSubmit={save}>
        <p className="auth-kicker">붕모에 오신 것을 환영해요</p>
        <h1>함께 부를 닉네임을 알려 주세요.</h1>
        <label htmlFor="nickname">닉네임</label>
        <input
          id="nickname"
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          aria-describedby={error ? "nickname-error" : undefined}
          autoComplete="nickname"
          autoFocus
          maxLength={17}
        />
        {error && <p id="nickname-error" className="form-error" role="alert">{error}</p>}
        <button type="submit" disabled={saving}>{saving ? "저장 중…" : "시작하기"}</button>
      </form>
    </main>
  );
}
