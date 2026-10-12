import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { CloseIcon, PlusIcon, TrashIcon } from './Icons';

export function ContactsModal({
  isOpen,
  currentUser,
  onClose,
  onSelectContactForDivvy,
}) {
  const [contacts, setContacts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadContacts();
    }
  }, [isOpen]);

  const loadContacts = async () => {
    setLoading(true);
    try {
      const res = await api.contacts.list();
      setContacts(res.contacts || []);
    } catch (err) {
      console.warn('Could not load contacts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateContact = async (e) => {
    e.preventDefault();
    setError('');
    if (!newName.trim()) {
      setError('Name is required');
      return;
    }
    if (!newEmail.trim() && !newPhone.trim()) {
      setError('Either email or phone is required');
      return;
    }

    try {
      const res = await api.contacts.create({
        name: newName.trim(),
        email: newEmail.trim() || undefined,
        phone: newPhone.trim() || undefined,
      });
      setContacts([...contacts, res.contact]);
      setNewName('');
      setNewEmail('');
      setNewPhone('');
      setIsAdding(false);
    } catch (err) {
      setError(err.message || 'Failed to add contact');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Remove this contact from your address book?')) return;
    try {
      await api.contacts.delete(id);
      setContacts(contacts.filter((c) => c.id !== id));
    } catch (err) {
      alert(err.message || 'Could not delete contact');
    }
  };

  if (!isOpen) return null;

  const filtered = contacts.filter((c) =>
    (c.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.phone || '').includes(searchQuery)
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>👥 Contacts & Address Book</h3>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="modal-body">
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search contacts..."
              className="form-input"
              style={{ flex: 1 }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setIsAdding(!isAdding)}
            >
              <PlusIcon size={14} /> New Contact
            </button>
          </div>

          {/* New contact inline form */}
          {isAdding && (
            <form onSubmit={handleCreateContact} style={{ background: 'var(--bg-surface-elevated)', padding: '16px', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontWeight: 600, fontSize: '14px' }}>Add Contact to Address Book</div>
              <input
                type="text"
                placeholder="Name *"
                className="form-input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <input
                  type="email"
                  placeholder="Email"
                  className="form-input"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
                <input
                  type="tel"
                  placeholder="Phone"
                  className="form-input mono"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                />
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Unique key = phone + email concatenated.
              </div>
              {error && <div className="form-error">{error}</div>}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '6px' }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIsAdding(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm">
                  Save Contact
                </button>
              </div>
            </form>
          )}

          {/* Contacts List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '350px', overflowY: 'auto' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>Loading contacts...</div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                No contacts found. Click "+ New Contact" to add friends!
              </div>
            ) : (
              filtered.map((c) => {
                const isUser =
                  c.id === currentUser?.id ||
                  c.isUser ||
                  (currentUser?.email && c.email?.toLowerCase() === currentUser?.email?.toLowerCase()) ||
                  (currentUser?.phone && c.phone && c.phone === currentUser?.phone);

                return (
                  <div
                    key={c.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 14px',
                      background: isUser ? 'rgba(60, 198, 176, 0.08)' : 'var(--bg-surface-elevated)',
                      borderRadius: 'var(--radius-md)',
                      border: isUser ? '1px solid var(--accent-teal)' : '1px solid var(--border-subtle)',
                      boxShadow: isUser ? '0 0 10px rgba(60, 198, 176, 0.1)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '50%',
                          background: isUser
                            ? 'linear-gradient(135deg, var(--accent-teal), #059669)'
                            : 'linear-gradient(135deg, var(--accent-coral), var(--accent-amber))',
                          color: '#fff',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '13px',
                        }}
                      >
                        {c.name ? c.name.slice(0, 2).toUpperCase() : 'C'}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 600, fontSize: '14px' }}>
                            {c.nickname ? `${c.nickname} (${c.name})` : c.name}
                          </span>
                          {isUser && (
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: 'var(--radius-full)',
                                background: 'rgba(60, 198, 176, 0.2)',
                                color: 'var(--accent-teal)',
                                border: '1px solid rgba(60, 198, 176, 0.4)',
                              }}
                            >
                              You
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {c.email || c.phone} {c.sharedDivvys > 0 && `• ${c.sharedDivvys} shared divvys`}
                        </div>
                      </div>
                    </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {onSelectContactForDivvy && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          onSelectContactForDivvy(c);
                          onClose();
                        }}
                      >
                        + Add to Divvy
                      </button>
                    )}
                    <button
                      type="button"
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px' }}
                      onClick={() => handleDelete(c.id)}
                      title="Delete contact"
                    >
                      <TrashIcon size={14} />
                    </button>
                  </div>
                </div>
              );
            })
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
