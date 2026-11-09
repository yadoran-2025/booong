"use client";

import { useEffect } from "react";

export default function AccessPage() {
  useEffect(() => { window.location.replace("/admin.html"); }, []);
  return <main className="auth-screen"><a className="btn btn--primary" href="/admin.html">BOOONG 운영자 공간으로 이동</a></main>;
}
