'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { siteConfig } from '@/lib/site-config';
import styles from './page.module.css';

type Step = 'register' | 'verify' | 'done';

export default function RegisterPage() {
  const { user, signUp, confirmSignUp } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<Step>('register');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) router.push('/');
  }, [user, router]);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      await signUp(email, password, name);
      setStep('verify');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await confirmSignUp(email, code);
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'done') {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.success}>
            <div className={styles.successTitle}>Registration Complete</div>
            <p className={styles.successText}>
              Your account is ready! You can now sign in, browse the family tree, and contribute to
              memorial walls.
            </p>
            <p className={styles.successText}>
              Want to add or edit family members? You can request editor access from your account
              settings after signing in.
            </p>
            <Link href="/login" className={styles.link}>
              Go to Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'verify') {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <h1 className={styles.title}>Verify Email</h1>
          <p className={styles.subtitle}>We sent a verification code to {email}</p>
          <form onSubmit={handleVerify} className={styles.form}>
            <label className={styles.label}>
              Verification Code
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className={styles.input}
                required
                autoComplete="one-time-code"
                autoFocus
              />
            </label>
            {error && <p className={styles.error}>{error}</p>}
            <button type="submit" className={styles.button} disabled={loading}>
              {loading ? 'Verifying...' : 'Verify'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Register</h1>
        <p className={styles.subtitle}>{siteConfig.treeName}</p>
        <form onSubmit={handleRegister} className={styles.form}>
          <label className={styles.label}>
            Full Name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={styles.input}
              required
              autoComplete="name"
            />
          </label>
          <label className={styles.label}>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={styles.input}
              required
              autoComplete="email"
            />
          </label>
          <label className={styles.label}>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.input}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          <label className={styles.label}>
            Confirm Password
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={styles.input}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          <div className={styles.notice}>
            After verifying your email, you&apos;ll be able to browse the tree and contribute to
            memorial walls right away. You can request editor access later from your account
            settings.
          </div>
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" className={styles.button} disabled={loading}>
            {loading ? 'Registering...' : 'Register'}
          </button>
        </form>
        <Link href="/login" className={styles.link}>
          Already have an account? Sign In
        </Link>
      </div>
    </div>
  );
}
