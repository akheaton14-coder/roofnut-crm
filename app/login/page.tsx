"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const supabase = createClient();

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) setMessage(error.message);
      else if (data.session) router.replace("/");
      else setMessage("Check your email to confirm your account, then return here to sign in.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(error.message);
      else router.replace("/");
    }
    setBusy(false);
  }

  return (
    <main className="login-page">
      <section className="login-brand">
        <div className="login-logo"><span>R</span><b>ROOFNUT <em>CRM</em></b></div>
        <div className="login-promise">
          <p>YOUR ROOFING COMMAND CENTER</p>
          <h1>Every lead.<br />Every roof.<br /><i>Nothing missed.</i></h1>
          <p className="login-copy">Sales, production, communication and intelligence—finally working as one.</p>
        </div>
        <small>Private and secure for the Roofnut team.</small>
      </section>
      <section className="login-form-wrap">
        <form className="login-form" onSubmit={submit}>
          <span className="login-spark">✦</span>
          <p className="eyebrow">WELCOME TO ROOFNUT</p>
          <h2>{mode === "signin" ? "Sign in to your command center." : "Create the first administrator."}</h2>
          <p>{mode === "signin" ? "Use your Roofnut team account to continue." : "The first account becomes the Roofnut CRM administrator."}</p>
          {mode === "signup" && <label>Full name<input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Kendall Roofnut" /></label>}
          <label>Email address<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@roofnut.com" /></label>
          <label>Password<input required type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" /></label>
          {message && <div className="login-message">{message}</div>}
          <button className="login-submit" disabled={busy}>{busy ? "Working…" : mode === "signin" ? "Sign in →" : "Create administrator →"}</button>
          <button type="button" className="login-switch" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(""); }}>
            {mode === "signin" ? "First time here? Create the administrator account" : "Already have an account? Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
