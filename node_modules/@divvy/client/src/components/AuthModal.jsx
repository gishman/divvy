import React, { useState } from 'react';
import { api, setStoredToken } from '../api';
import { CloseIcon } from './Icons';

export function AuthModal({
  isOpen,
  onClose,
  currentUser,
  onAuthSuccess,
  onSignOut,
  forceRegister = false,
}) {
  const [mode, setMode] = useState(forceRegister || !currentUser ? 'register' : 'profile'); // 'register', 'login', 'verify', 'profile'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [verificationId, setVerificationId] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [choices, setChoices] = useState([]);
  const [selectedContactId, setSelectedContactId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Please provide your name');
      return;
    }
    if (!email.trim() && !phone.trim()) {
      setError('Please provide either an email or phone number');
      return;
    }

    setLoading(true);
    try {
      const res = await api.auth.register({
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      setVerificationId(res.verificationId);
      setSentTo(res.sentTo);
      setDevCode(res.devCode || '');
      if (res.devCode) setCode(res.devCode);
      setMode('verify');
    } catch (err) {
      if (err.data?.code === 'EXISTS') {
        setError('An account already exists with this email/phone. Please sign in instead.');
        setIdentifier(email.trim() || phone.trim());
        setMode('login');
      } else {
        setError(err.message || 'Registration failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    if (!identifier.trim()) {
      setError('Enter your email or phone number');
      return;
    }

    setLoading(true);
    try {
      const res = await api.auth.login(identifier.trim());
      setVerificationId(res.verificationId);
      setSentTo(res.sentTo);
      setDevCode(res.devCode || '');
      if (res.devCode) setCode(res.devCode);
      setMode('verify');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setError('');
    if (!code.trim() || code.trim().length !== 6) {
      setError('Enter the 6-digit verification code');
      return;
    }

    setLoading(true);
    try {
      const res = await api.auth.verify({
        verificationId,
        code: code.trim(),
        contactId: selectedContactId || undefined,
      });

      if (res.choices && res.choices.length > 1) {
        setChoices(res.choices);
        setSelectedContactId(res.choices[0].id);
        return;
      }

      setStoredToken(res.token);
      onAuthSuccess(res.user);
      onClose();
    } catch (err) {
      setError(err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={currentUser ? onClose : undefined}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            {mode === 'register' && '👋 Welcome to divvy'}
            {mode === 'login' && '🔑 Sign In to divvy'}
            {mode === 'verify' && '✉️ Verify Your Code'}
            {mode === 'profile' && '👤 Your Profile'}
          </h3>
          {currentUser && (
            <button type="button" className="modal-close-btn" onClick={onClose}>
              <CloseIcon />
            </button>
          )}
        </div>

        {/* REGISTER */}
        {mode === 'register' && (
          <form onSubmit={handleRegister}>
            <div className="modal-body">
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                To get started, create your contact profile. All you need is a name and either an email or phone number.
              </p>

              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Taylor Swift"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Phone Number</label>
                <input
                  type="tel"
                  className="form-input mono"
                  placeholder="(555) 123-4567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <span className="form-hint">At least one contact method (email or phone) is required.</span>
              </div>

              {error && <div className="form-error">{error}</div>}
            </div>

            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => { setError(''); setMode('login'); }}
              >
                Already have an account? Sign in
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Sending Code...' : 'Continue →'}
              </button>
            </div>
          </form>
        )}

        {/* LOGIN */}
        {mode === 'login' && (
          <form onSubmit={handleLogin}>
            <div className="modal-body">
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Enter the email or phone number registered with your divvy account.
              </p>

              <div className="form-group">
                <label className="form-label">Email or Phone *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="name@example.com or (555) 123-4567"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              {error && <div className="form-error">{error}</div>}
            </div>

            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => { setError(''); setMode('register'); }}
              >
                New user? Create profile
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Sending Code...' : 'Send Code →'}
              </button>
            </div>
          </form>
        )}

        {/* VERIFY CODE */}
        {mode === 'verify' && (
          <form onSubmit={handleVerify}>
            <div className="modal-body">
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                We sent a 6-digit verification code to <strong>{sentTo}</strong>.
              </p>

              {devCode && (
                <div style={{ background: 'rgba(60, 198, 176, 0.15)', border: '1px solid var(--accent-teal)', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: '13px' }}>
                  🛠 <strong>Dev code:</strong> <code style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{devCode}</code>
                  <span style={{ marginLeft: '8px', color: 'var(--text-muted)' }}>(auto-filled)</span>
                </div>
              )}

              {choices.length > 0 && (
                <div className="form-group">
                  <label className="form-label">Multiple profiles share this contact info. Which one is you?</label>
                  <select
                    className="form-input"
                    value={selectedContactId}
                    onChange={(e) => setSelectedContactId(e.target.value)}
                  >
                    {choices.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Enter 6-digit Code</label>
                <input
                  type="text"
                  maxLength={6}
                  className="form-input mono"
                  style={{ fontSize: '24px', letterSpacing: '6px', textAlign: 'center' }}
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  autoFocus
                  required
                />
              </div>

              {error && <div className="form-error">{error}</div>}
            </div>

            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setMode('login')}
              >
                Back
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Verifying...' : 'Verify & Enter'}
              </button>
            </div>
          </form>
        )}

        {/* PROFILE / SIGN OUT */}
        {mode === 'profile' && currentUser && (
          <div className="modal-body">
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 0' }}>
              <div
                className="user-avatar-btn"
                style={{ width: '56px', height: '56px', fontSize: '20px' }}
              >
                {currentUser.name?.slice(0, 2).toUpperCase() || 'U'}
              </div>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 700 }}>{currentUser.name}</h3>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  {currentUser.email || currentUser.phone}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--status-complete)', marginTop: '2px' }}>
                  ✓ Verified divvy member
                </div>
              </div>
            </div>

            <div className="modal-footer" style={{ justifyContent: 'space-between', padding: '16px 0 0' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  onSignOut();
                  setMode('login');
                }}
              >
                Sign Out / Switch Account
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
