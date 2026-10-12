import React, { useState, useEffect } from 'react';
import { PARTY_COLORS } from '@divvy/shared';
import { api } from '../api';
import { CloseIcon, PlusIcon } from './Icons';

export function AddPartyModal({
  isOpen,
  onClose,
  existingParties = [],
  currentUser,
  onConfirmAddParty,
}) {
  const [tab, setTab] = useState('contacts'); // 'contacts' | 'new'
  const [contacts, setContacts] = useState([]);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [selectedContactId, setSelectedContactId] = useState('');
  const [selectedColor, setSelectedColor] = useState(PARTY_COLORS[0]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadContacts();
      // Auto pick next available color
      const usedColors = new Set(existingParties.map((p) => p.color));
      const nextColor = PARTY_COLORS.find((c) => !usedColors.has(c)) || PARTY_COLORS[0];
      setSelectedColor(nextColor);
    }
  }, [isOpen, existingParties]);

  const loadContacts = async () => {
    try {
      const res = await api.contacts.list();
      setContacts(res.contacts || []);
      if (res.contacts?.length > 0) {
        setSelectedContactId(res.contacts[0].id);
      }
    } catch (err) {
      console.warn(err);
    }
  };

  if (!isOpen) return null;

  const existingContactIds = new Set(existingParties.map((p) => p.contactId));
  const availableContacts = contacts.filter((c) => !existingContactIds.has(c.id));

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (tab === 'contacts') {
      if (!selectedContactId) {
        setError('Please select a contact from the list or add a new one');
        return;
      }
      const contact = contacts.find((c) => c.id === selectedContactId);
      onConfirmAddParty({
        contactId: selectedContactId,
        name: contact?.name,
        color: selectedColor,
      });
      onClose();
    } else {
      if (!newName.trim()) {
        setError('Name is required');
        return;
      }
      onConfirmAddParty({
        name: newName.trim(),
        email: newEmail.trim() || undefined,
        phone: newPhone.trim() || undefined,
        color: selectedColor,
      });
      onClose();
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>➕ Add Party to Divvy</h3>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className={`btn ${tab === 'contacts' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                style={{ flex: 1 }}
                onClick={() => setTab('contacts')}
              >
                Choose from Contacts
              </button>
              <button
                type="button"
                className={`btn ${tab === 'new' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                style={{ flex: 1 }}
                onClick={() => setTab('new')}
              >
                Create New Party
              </button>
            </div>

            {/* TAB: CONTACTS */}
            {tab === 'contacts' && (
              <div className="form-group">
                <label className="form-label">Select Person</label>
                {availableContacts.length === 0 ? (
                  <div style={{ padding: '16px', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-md)', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
                    No contacts left in address book. Switch to "Create New Party" above!
                  </div>
                ) : (
                  <select
                    className="form-input"
                    value={selectedContactId}
                    onChange={(e) => setSelectedContactId(e.target.value)}
                  >
                    {availableContacts.map((c) => {
                      const isUser =
                        c.id === currentUser?.id ||
                        c.isUser ||
                        (currentUser?.email && c.email?.toLowerCase() === currentUser?.email?.toLowerCase()) ||
                        (currentUser?.phone && c.phone && c.phone === currentUser?.phone);

                      return (
                        <option key={c.id} value={c.id}>
                          {c.name} {isUser ? '(You)' : ''} ({c.email || c.phone || 'no contact info'})
                        </option>
                      );
                    })}
                  </select>
                )}
              </div>
            )}

            {/* TAB: NEW */}
            {tab === 'new' && (
              <>
                <div className="form-group">
                  <label className="form-label">Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Jordan Lee"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    required
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input
                      type="email"
                      className="form-input"
                      placeholder="jordan@example.com"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Phone</label>
                    <input
                      type="tel"
                      className="form-input mono"
                      placeholder="(555) 000-0000"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                    />
                  </div>
                </div>
              </>
            )}

            {/* Color Palette Selector */}
            <div className="form-group">
              <label className="form-label">Party Avatar Color</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {PARTY_COLORS.map((color) => {
                  const isSelected = selectedColor === color;
                  return (
                    <button
                      key={color}
                      type="button"
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: color,
                        border: isSelected ? '3px solid #fff' : '2px solid transparent',
                        boxShadow: isSelected ? `0 0 12px ${color}` : 'none',
                        cursor: 'pointer',
                        transform: isSelected ? 'scale(1.15)' : 'scale(1)',
                        transition: 'all 0.15s ease',
                      }}
                      onClick={() => setSelectedColor(color)}
                      aria-label={`Select color ${color}`}
                    />
                  );
                })}
              </div>
            </div>

            {error && <div className="form-error">{error}</div>}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Add to Divvy
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
