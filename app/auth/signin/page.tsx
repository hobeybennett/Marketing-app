'use client';
import { signIn, useSession } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useEffect, useState, useRef } from 'react';

function SignInContent() {
  const params = useSearchParams();
  const callbackUrl = params.get('callbackUrl') ?? '/campaigns';
  const { data: session, status } = useSession();
  const router = useRouter();

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sendError, setSendError] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status === 'authenticated') router.replace(callbackUrl);
  }, [status, callbackUrl, router]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    setSendError('');
    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send code');
      setStep('code');
      setResendCooldown(60);
      setTimeout(() => codeInputRef.current?.focus(), 100);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSending(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (code.trim().length !== 6) return;
    setVerifying(true);
    setVerifyError('');
    const result = await signIn('email-otp', {
      email: email.trim(),
      code: code.trim(),
      redirect: false,
      callbackUrl,
    });
    if (result?.error) {
      setVerifyError('Incorrect or expired code. Check your email and try again.');
      setVerifying(false);
    } else if (result?.ok) {
      router.replace(callbackUrl);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0 || sending) return;
    setSending(true);
    setSendError('');
    setCode('');
    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed');
      }
      setResendCooldown(60);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-96 h-96 rounded-full bg-violet-600/10 blur-[120px]" />
        <div className="absolute bottom-1/3 right-1/4 w-80 h-80 rounded-full bg-blue-500/10 blur-[100px]" />
      </div>

      <div className="relative z-10 bg-gray-900 border border-gray-800 rounded-2xl p-10 w-full max-w-sm shadow-2xl shadow-black/40">
        <h1 className="font-display text-4xl font-800 gradient-text mb-2 tracking-tight text-center">Promohit</h1>
        <p className="text-gray-400 text-sm mb-8 text-center">Automated music promotion on Meta</p>

        {step === 'email' ? (
          <>
            <form onSubmit={handleSendCode} className="mb-5">
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Your email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
                className="w-full bg-gray-800 border border-gray-700 focus:border-violet-500 outline-none rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 transition-colors mb-3"
              />
              {sendError && <p className="text-red-400 text-xs mb-3">{sendError}</p>}
              <button
                type="submit"
                disabled={sending || !email.trim()}
                className="btn-primary w-full py-3 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {sending ? 'Sending code…' : 'Continue with email →'}
              </button>
            </form>

            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-px bg-gray-800" />
              <span className="text-xs text-gray-600">or</span>
              <div className="flex-1 h-px bg-gray-800" />
            </div>

            <button
              onClick={() => signIn('google', { callbackUrl })}
              className="w-full flex items-center justify-center gap-3 bg-white text-gray-900 font-semibold py-3 px-6 rounded-xl hover:bg-gray-100 transition text-sm"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>
          </>
        ) : (
          <>
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-1">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-green-400 shrink-0">
                  <path d="M2.5 7l3 3 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <p className="text-xs text-green-400 font-medium">Code sent to {email}</p>
              </div>
              <button
                type="button"
                onClick={() => { setStep('email'); setCode(''); setVerifyError(''); }}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Wrong email? Change it
              </button>
            </div>

            <form onSubmit={handleVerifyCode}>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">6-digit code</label>
              <input
                ref={codeInputRef}
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="w-full bg-gray-800 border border-gray-700 focus:border-violet-500 outline-none rounded-xl px-4 py-3 text-2xl font-mono tracking-[0.5em] text-center text-white placeholder-gray-600 transition-colors mb-3"
              />
              {verifyError && <p className="text-red-400 text-xs mb-3">{verifyError}</p>}
              <button
                type="submit"
                disabled={verifying || code.length !== 6}
                className="btn-primary w-full py-3 text-sm disabled:opacity-40 disabled:cursor-not-allowed mb-4"
              >
                {verifying ? 'Verifying…' : 'Sign in →'}
              </button>
            </form>

            <p className="text-center text-xs text-gray-500">
              Didn&apos;t get it?{' '}
              {resendCooldown > 0 ? (
                <span className="text-gray-600">Resend in {resendCooldown}s</span>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={sending}
                  className="text-violet-400 hover:text-violet-300 transition-colors disabled:opacity-50"
                >
                  {sending ? 'Sending…' : 'Resend code'}
                </button>
              )}
            </p>
            {sendError && <p className="text-red-400 text-xs text-center mt-2">{sendError}</p>}
          </>
        )}

        <p className="text-xs text-gray-600 mt-6 text-center">
          By signing in you agree to our terms of service.
        </p>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInContent />
    </Suspense>
  );
}
