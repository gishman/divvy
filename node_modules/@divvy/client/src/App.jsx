import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { computeSplit, deriveStatus, PARTY_COLORS } from '@divvy/shared';
import { api, getStoredToken, setStoredToken } from './api';
import { subscribeToDivvy } from './realtime';
import { DockNav } from './components/DockNav';
import { OrbitalWheel } from './components/OrbitalWheel';
import { ReceiptView } from './components/ReceiptView';
import { PartiesList } from './components/PartiesList';
import { FloatingActionBar } from './components/FloatingActionBar';
import { AssignItemModal } from './components/AssignItemModal';
import { AssignRemainingModal } from './components/AssignRemainingModal';
import { ReceiptScannerModal } from './components/ReceiptScannerModal';
import { AddPartyModal } from './components/AddPartyModal';
import { AuthModal } from './components/AuthModal';
import { ContactsModal } from './components/ContactsModal';
import { HistoryModal } from './components/HistoryModal';
import { GamificationModal } from './components/GamificationModal';
import { SimpleView } from './components/SimpleView';
import { PaymentModal } from './components/PaymentModal';
import { Toast } from './components/Toast';

// Rich fallback demo divvy matching notes.md spec (4 parties: P1 & P4 pay items, P2 & P3 split remainder)
const DEMO_DIVVY = {
  id: 'demo-divvy-1',
  title: 'Dinner at Osteria Del Mare',
  merchant: 'Osteria Del Mare',
  receiptDate: new Date().toISOString().slice(0, 10),
  status: 'open',
  items: [
    { id: 'item_1', description: 'Woodfired Truffle Pizza', quantity: 1, priceCents: 2800 },
    { id: 'item_2', description: 'Handmade Tagliatelle Ragu', quantity: 1, priceCents: 2600 },
    { id: 'item_3', description: 'Pan-Seared Branzino', quantity: 1, priceCents: 3400 },
    { id: 'item_4', description: 'Burrata Caprese & Focaccia', quantity: 1, priceCents: 1800 },
    { id: 'item_5', description: 'Espresso Martinis (x4)', quantity: 4, priceCents: 4800 },
    { id: 'item_6', description: 'Tiramisu Della Casa', quantity: 2, priceCents: 1600 },
  ],
  adjustments: [
    { id: 'adj_tax', kind: 'tax', label: 'Sales Tax (8.875%)', amountCents: 1510 },
    { id: 'adj_tip', kind: 'tip', label: 'Tip (20%)', amountCents: 3400 },
  ],
  parties: [
    { id: 'party_1', contactId: 'user_1', name: 'Alex Rivera', color: '#f26b5b', paidAt: null },
    { id: 'party_2', contactId: 'user_2', name: 'Sam Chen', color: '#f5b04c', paidAt: null },
    { id: 'party_3', contactId: 'user_3', name: 'Morgan Vance', color: '#3cc6b0', paidAt: null },
    { id: 'party_4', contactId: 'user_4', name: 'Taylor Brooks', color: '#a78bfa', paidAt: null },
  ],
  allocations: [
    // Spec example: P1 pays item 1 (Pizza) & item 4 (Burrata)
    { id: 'alloc_1', partyId: 'party_1', itemId: 'item_1', mode: 'percent', value: 100 },
    { id: 'alloc_2', partyId: 'party_1', itemId: 'item_4', mode: 'percent', value: 100 },
    // P4 pays item 3 (Branzino)
    { id: 'alloc_3', partyId: 'party_4', itemId: 'item_3', mode: 'percent', value: 100 },
  ],
};

const DEMO_USER = {
  id: 'user_1',
  name: 'Alex Rivera',
  email: 'alex@example.com',
  phone: '(555) 234-5678',
};

export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('divvy'); // 'divvy', 'history', 'contacts', 'awards'
  const [viewMode, setViewMode] = useState('workbench'); // 'workbench' | 'simple'
  const [divvysList, setDivvysList] = useState([]);
  const [currentDivvy, setCurrentDivvy] = useState(DEMO_DIVVY);
  const [viewers, setViewers] = useState([]);
  const [selectedItemIds, setSelectedItemIds] = useState(new Set());
  const [toasts, setToasts] = useState([]);

  // Modals state
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [scannerModalOpen, setScannerModalOpen] = useState(false);
  const [assignItemModalOpen, setAssignItemModalOpen] = useState(false);
  const [assignRemainingModalOpen, setAssignRemainingModalOpen] = useState(false);
  const [targetPartyForRemainder, setTargetPartyForRemainder] = useState(null);
  const [itemsToAssign, setItemsToAssign] = useState([]);
  const [targetPartyForAssignItem, setTargetPartyForAssignItem] = useState(null);
  const [addPartyModalOpen, setAddPartyModalOpen] = useState(false);
  const [contactsModalOpen, setContactsModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [gamificationModalOpen, setGamificationModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [targetPartyForPayment, setTargetPartyForPayment] = useState(null);

  const handleOpenPayment = (party) => {
    setTargetPartyForPayment(party);
    setPaymentModalOpen(true);
  };

  const addToast = (message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  // Initialize Auth
  useEffect(() => {
    async function initAuth() {
      const token = getStoredToken();
      if (!token) {
        // As per notes.md: upon initializing, if there does not exist a contact record, popup form
        setAuthModalOpen(true);
        setUser(DEMO_USER); // Preload demo profile so UI is immediately visible behind modal
        return;
      }
      try {
        const res = await api.auth.me();
        setUser(res.user);
      } catch (err) {
        console.warn('Session expired or offline:', err.message);
        setStoredToken(null);
        setAuthModalOpen(true);
        setUser(DEMO_USER);
      }
    }
    initAuth();
  }, []);

  const loadDivvyDetails = useCallback(async (id) => {
    if (id === DEMO_DIVVY.id) {
      setCurrentDivvy(DEMO_DIVVY);
      return;
    }
    try {
      const res = await api.divvys.get(id);
      setCurrentDivvy(res.divvy);
    } catch (err) {
      addToast(err.message || 'Could not load divvy', 'error');
    }
  }, []);

  // Fetch Divvys
  const fetchDivvys = useCallback(async () => {
    if (!getStoredToken()) {
      setDivvysList([DEMO_DIVVY]);
      return;
    }
    try {
      const res = await api.divvys.list();
      setDivvysList(res.divvys || []);
      if (res.divvys?.length > 0 && currentDivvy.id === DEMO_DIVVY.id) {
        loadDivvyDetails(res.divvys[0].id);
      }
    } catch (err) {
      console.warn('Could not fetch divvys list, using demo:', err.message);
      setDivvysList([DEMO_DIVVY]);
    }
  }, [currentDivvy.id, loadDivvyDetails]);

  useEffect(() => {
    fetchDivvys();
  }, [fetchDivvys]);

  // Real-time synchronization
  useEffect(() => {
    if (!currentDivvy?.id || currentDivvy.id === DEMO_DIVVY.id) return;
    const unsub = subscribeToDivvy(currentDivvy.id, {
      onUpdated: (freshDivvy, info) => {
        setCurrentDivvy(freshDivvy);
        if (info?.reason) addToast(`Live update: ${info.reason}`, 'info');
      },
      onPresence: (currentViewers) => {
        setViewers(currentViewers);
      },
      onDivvysChanged: () => {
        fetchDivvys();
      },
    });
    return unsub;
  }, [currentDivvy?.id, fetchDivvys]);

  // Compute live split
  const split = useMemo(() => {
    if (!currentDivvy) return null;
    return computeSplit(currentDivvy);
  }, [currentDivvy]);

  // Derive status
  const currentStatus = useMemo(() => {
    if (!split) return 'open';
    return deriveStatus(split, currentDivvy?.parties || []);
  }, [split, currentDivvy?.parties]);

  // Handle Tab changes
  useEffect(() => {
    if (activeTab === 'history') setHistoryModalOpen(true);
    if (activeTab === 'contacts') setContactsModalOpen(true);
    if (activeTab === 'awards') setGamificationModalOpen(true);
  }, [activeTab]);

  // ------------------------------------------------------------- Line Item Selection (Rule 1)
  const toggleSelectItem = (itemId) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const selectAllItems = () => {
    setSelectedItemIds(new Set((currentDivvy?.items || []).map((it) => it.id)));
  };

  const clearSelection = () => {
    setSelectedItemIds(new Set());
  };

  const selectedItemsList = useMemo(() => {
    return (currentDivvy?.items || []).filter((it) => selectedItemIds.has(it.id));
  }, [currentDivvy?.items, selectedItemIds]);

  const selectedTotalCents = useMemo(() => {
    return selectedItemsList.reduce((sum, it) => sum + (it.priceCents || 0), 0);
  }, [selectedItemsList]);

  // Clicking an item directly calls the assign function (Rule 1)
  const handleItemClick = (item) => {
    if (selectedItemIds.has(item.id) && selectedItemsList.length > 1) {
      setItemsToAssign(selectedItemsList);
    } else {
      setItemsToAssign([item]);
    }
    setTargetPartyForAssignItem(null);
    setAssignItemModalOpen(true);
  };

  // Clicking a party member directly calls the assign function
  const handlePartyClick = (party) => {
    // If items are selected with checkboxes, assign those items to this party member!
    if (selectedItemIds.size > 0) {
      setItemsToAssign(selectedItemsList);
      setTargetPartyForAssignItem(party);
      setAssignItemModalOpen(true);
    } else {
      // If no items are selected, assign remaining pool to this party member (Rule 2)!
      setTargetPartyForRemainder(party);
      setAssignRemainingModalOpen(true);
    }
  };

  // ------------------------------------------------------------- Mutations
  const handleUpdateReceipt = async ({ items, adjustments }) => {
    const nextReceipt = {
      title: currentDivvy.title,
      merchant: currentDivvy.merchant,
      receiptDate: currentDivvy.receiptDate,
      items: items ?? currentDivvy.items,
      adjustments: adjustments ?? currentDivvy.adjustments,
    };

    if (currentDivvy.id === DEMO_DIVVY.id) {
      setCurrentDivvy({ ...currentDivvy, ...nextReceipt });
      addToast('Receipt updated', 'success');
      return;
    }

    try {
      const res = await api.divvys.updateReceipt(currentDivvy.id, nextReceipt);
      setCurrentDivvy(res.divvy);
      addToast('Receipt updated', 'success');
    } catch (err) {
      addToast(err.message || 'Update failed', 'error');
    }
  };

  const handleAddAllocations = async (allocations) => {
    if (currentDivvy.id === DEMO_DIVVY.id) {
      const newAllocs = allocations.map((a, idx) => ({
        id: `alloc_${Date.now()}_${idx}`,
        ...a,
      }));
      setCurrentDivvy({
        ...currentDivvy,
        allocations: [...currentDivvy.allocations, ...newAllocs],
      });
      clearSelection();
      addToast('Split assigned!', 'success');
      return;
    }

    try {
      const res = await api.divvys.addAllocations(currentDivvy.id, allocations);
      setCurrentDivvy(res.divvy);
      clearSelection();
      addToast('Split assigned!', 'success');
    } catch (err) {
      addToast(err.message || 'Allocation failed', 'error');
    }
  };

  const handleDeleteAllocation = async (allocId) => {
    if (currentDivvy.id === DEMO_DIVVY.id) {
      setCurrentDivvy({
        ...currentDivvy,
        allocations: currentDivvy.allocations.filter((a) => a.id !== allocId),
      });
      addToast('Assignment removed', 'info');
      return;
    }

    try {
      const res = await api.divvys.deleteAllocation(currentDivvy.id, allocId);
      setCurrentDivvy(res.divvy);
      addToast('Assignment removed', 'info');
    } catch (err) {
      addToast(err.message || 'Could not delete assignment', 'error');
    }
  };

  const handleAddParty = async ({ contactId, name, email, phone, color }) => {
    if (currentDivvy.id === DEMO_DIVVY.id) {
      const newParty = {
        id: `party_${Date.now()}`,
        contactId: contactId || `user_${Date.now()}`,
        name: name || 'New Guest',
        email,
        phone,
        color: color || PARTY_COLORS[currentDivvy.parties.length % PARTY_COLORS.length],
        paidAt: null,
      };
      setCurrentDivvy({
        ...currentDivvy,
        parties: [...currentDivvy.parties, newParty],
      });
      addToast(`Added ${name} to table`, 'success');
      return;
    }

    try {
      const res = await api.divvys.addParty(currentDivvy.id, {
        contactId,
        name,
        email,
        phone,
        color,
      });
      setCurrentDivvy(res.divvy);
      addToast(`Added ${name} to table`, 'success');
    } catch (err) {
      addToast(err.message || 'Could not add party', 'error');
    }
  };

  const handleRemoveParty = async (partyId) => {
    if (currentDivvy.parties.length <= 1) {
      addToast('A divvy must have at least one party', 'error');
      return;
    }
    if (currentDivvy.id === DEMO_DIVVY.id) {
      setCurrentDivvy({
        ...currentDivvy,
        parties: currentDivvy.parties.filter((p) => p.id !== partyId),
        allocations: currentDivvy.allocations.filter((a) => a.partyId !== partyId),
      });
      addToast('Party removed', 'info');
      return;
    }

    try {
      const res = await api.divvys.removeParty(currentDivvy.id, partyId);
      setCurrentDivvy(res.divvy);
      addToast('Party removed', 'info');
    } catch (err) {
      addToast(err.message || 'Could not remove party', 'error');
    }
  };

  const handleTogglePaid = async (partyId, isPaid) => {
    if (currentDivvy.id === DEMO_DIVVY.id) {
      setCurrentDivvy({
        ...currentDivvy,
        parties: currentDivvy.parties.map((p) =>
          p.id === partyId ? { ...p, paidAt: isPaid ? new Date().toISOString() : null, paid: isPaid } : p
        ),
      });
      addToast(isPaid ? 'Marked as paid ✓' : 'Marked unpaid', 'info');
      return;
    }

    try {
      const res = await api.divvys.setPaid(currentDivvy.id, partyId, isPaid);
      setCurrentDivvy(res.divvy);
      addToast(isPaid ? 'Marked as paid ✓' : 'Marked unpaid', 'info');
    } catch (err) {
      addToast(err.message || 'Could not update paid status', 'error');
    }
  };

  const handleCreateDivvy = async (payload) => {
    if (!getStoredToken()) {
      const newDivvy = {
        id: `divvy_${Date.now()}`,
        title: payload.title || 'New Divvy',
        merchant: payload.merchant || 'Restaurant',
        receiptDate: payload.receiptDate,
        status: 'open',
        items: payload.items || [],
        adjustments: payload.adjustments || [],
        parties: [
          { id: 'party_me', contactId: user?.id || 'user_1', name: user?.name || 'Me', color: PARTY_COLORS[0], paidAt: null },
        ],
        allocations: [],
      };
      setCurrentDivvy(newDivvy);
      setDivvysList((prev) => [newDivvy, ...prev]);
      addToast('New divvy created!', 'success');
      return { divvy: newDivvy };
    }

    const res = await api.divvys.create(payload);
    if (res.divvy) {
      setCurrentDivvy(res.divvy);
      fetchDivvys();
      addToast('New divvy created!', 'success');
    }
    return res;
  };

  const handleDeleteDivvy = async (divvyId) => {
    if (divvyId === DEMO_DIVVY.id) {
      setDivvysList(divvysList.filter((d) => d.id !== divvyId));
      return;
    }
    try {
      await api.divvys.delete(divvyId);
      setDivvysList((prev) => prev.filter((d) => d.id !== divvyId));
      if (currentDivvy.id === divvyId) {
        setCurrentDivvy(DEMO_DIVVY);
      }
      addToast('Divvy deleted', 'info');
    } catch (err) {
      addToast(err.message || 'Could not delete divvy', 'error');
    }
  };

  const handleSignOut = () => {
    setStoredToken(null);
    setUser(null);
    setAuthModalOpen(true);
    addToast('Signed out', 'info');
  };

  return (
    <div className="app-container">
      {/* 1. CodePen NPZKRN Inspired Dock */}
      <DockNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        onOpenProfile={() => setAuthModalOpen(true)}
        onOpenScan={() => setScannerModalOpen(true)}
      />

      {/* Main Content Area */}
      <div className="main-wrapper">
        {/* Top Header Bar */}
        <header className="top-bar">
          <div className="top-bar-title">
            <h1>{currentDivvy?.title || 'divvy workbench'}</h1>
            <span
              className={`badge badge-${currentStatus} ${currentStatus === 'open' ? 'badge-pulse' : ''}`}
            >
              {currentStatus}
            </span>
          </div>

          <div className="top-bar-actions">
            {/* Real-time Presence Avatars */}
            {viewers.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginRight: '12px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Viewing live:</span>
                <div style={{ display: 'flex', marginLeft: '4px' }}>
                  {viewers.slice(0, 4).map((v) => (
                    <div
                      key={v.contactId}
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: 'var(--accent-teal)',
                        color: '#000',
                        fontSize: '10px',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '2px solid var(--bg-surface)',
                        marginLeft: '-6px',
                      }}
                      title={`${v.name} is looking at this divvy`}
                    >
                      {v.name ? v.name[0].toUpperCase() : '•'}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* View Mode Toggle: Workbench vs Simple View */}
            <div
              className="view-mode-toggle"
              style={{
                display: 'inline-flex',
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-full)',
                padding: '2px',
                marginRight: '8px',
              }}
              role="group"
              aria-label="View Mode Toggle"
            >
              <button
                type="button"
                className={`btn btn-sm ${viewMode === 'workbench' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ borderRadius: 'var(--radius-full)', padding: '5px 14px', fontSize: '12px' }}
                onClick={() => setViewMode('workbench')}
                title="Full workbench with 360° orbital wheel meter"
              >
                📊 Workbench
              </button>
              <button
                type="button"
                className={`btn btn-sm ${viewMode === 'simple' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ borderRadius: 'var(--radius-full)', padding: '5px 14px', fontSize: '12px' }}
                onClick={() => setViewMode('simple')}
                title="Simple view: receipt, party members, and all items completed below"
              >
                📄 Simple View
              </button>
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setScannerModalOpen(true)}
            >
              📷 Scan Receipt
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setAddPartyModalOpen(true)}
            >
              + Add Party
            </button>
          </div>
        </header>

        {/* Content Body */}
        <main className="content-body">
          {viewMode === 'simple' ? (
            /* Simple View: Receipt, Party Members, and below All Items Completed */
            <SimpleView
              divvy={currentDivvy}
              split={split}
              currentUser={user}
              onAssignItem={handleItemClick}
              onSelectPartyForRemainder={handlePartyClick}
              onTogglePaid={handleTogglePaid}
              onOpenPayment={handleOpenPayment}
              onOpenAddParty={() => setAddPartyModalOpen(true)}
              onRemoveParty={handleRemoveParty}
              onUpdateReceipt={handleUpdateReceipt}
            />
          ) : (
            <>
              {/* 2. CodePen vEgMwee Inspired 360-degree Orbital Wheel */}
              <OrbitalWheel
                split={split}
                parties={currentDivvy?.parties || []}
                status={currentStatus}
                onAssignRemainder={() => {
                  setTargetPartyForRemainder(currentDivvy?.parties?.[0] || null);
                  setAssignRemainingModalOpen(true);
                }}
              />

              {/* Workbench Grid: Left = 3-Section Receipt, Right = Parties */}
              <div className="workbench-grid">
                {/* 3-Section Receipt Breakdown */}
                <ReceiptView
                  divvy={currentDivvy}
                  split={split}
                  selectedItemIds={selectedItemIds}
                  onToggleSelectItem={toggleSelectItem}
                  onSelectAllItems={selectAllItems}
                  onClearSelection={clearSelection}
                  onAssignItem={handleItemClick}
                  onUpdateReceipt={handleUpdateReceipt}
                  onDeleteAllocation={handleDeleteAllocation}
                />

                {/* Parties Breakdown & Direct Click to Assign */}
                <PartiesList
                  parties={currentDivvy?.parties || []}
                  split={split}
                  currentUser={user}
                  onOpenAddParty={() => setAddPartyModalOpen(true)}
                  onSelectPartyForRemainder={handlePartyClick}
                  onTogglePaid={handleTogglePaid}
                  onOpenPayment={handleOpenPayment}
                  onRemoveParty={handleRemoveParty}
                />
              </div>
            </>
          )}
        </main>
      </div>

      {/* Floating Action Bar for Selected Items tip */}
      <FloatingActionBar
        selectedCount={selectedItemIds.size}
        selectedTotalCents={selectedTotalCents}
        onClear={clearSelection}
      />

      {/* MODALS */}
      {/* Rule 1 Modal: Assign Selected Items */}
      <AssignItemModal
        isOpen={assignItemModalOpen}
        onClose={() => {
          setAssignItemModalOpen(false);
          setItemsToAssign([]);
          setTargetPartyForAssignItem(null);
        }}
        selectedItems={itemsToAssign.length > 0 ? itemsToAssign : selectedItemsList}
        parties={currentDivvy?.parties || []}
        initialParty={targetPartyForAssignItem}
        onConfirmAssign={handleAddAllocations}
      />

      {/* Rule 2 Modal: Assign Remaining Amount */}
      <AssignRemainingModal
        isOpen={assignRemainingModalOpen}
        onClose={() => setAssignRemainingModalOpen(false)}
        initialParty={targetPartyForRemainder}
        parties={currentDivvy?.parties || []}
        unassignedCents={split?.unassignedCents || 0}
        onConfirmAssign={handleAddAllocations}
      />

      {/* Receipt Scanner & Creator */}
      <ReceiptScannerModal
        isOpen={scannerModalOpen}
        onClose={() => setScannerModalOpen(false)}
        onCreateDivvy={handleCreateDivvy}
        onJoinExisting={loadDivvyDetails}
      />

      {/* Add Party Modal */}
      <AddPartyModal
        isOpen={addPartyModalOpen}
        onClose={() => setAddPartyModalOpen(false)}
        existingParties={currentDivvy?.parties || []}
        currentUser={user}
        onConfirmAddParty={handleAddParty}
      />

      {/* Auth & Registration Modal (pop up upon init per spec) */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        currentUser={user}
        onAuthSuccess={(authedUser) => {
          setUser(authedUser);
          fetchDivvys();
          addToast(`Welcome, ${authedUser.name}!`, 'success');
        }}
        onSignOut={handleSignOut}
      />

      {/* Contacts Management Modal */}
      <ContactsModal
        isOpen={contactsModalOpen}
        currentUser={user}
        onClose={() => {
          setContactsModalOpen(false);
          setActiveTab('divvy');
        }}
        onSelectContactForDivvy={(contact) => {
          handleAddParty({
            contactId: contact.id,
            name: contact.name,
            email: contact.email,
            phone: contact.phone,
          });
          setActiveTab('divvy');
        }}
      />

      {/* Past Divvys History Modal */}
      <HistoryModal
        isOpen={historyModalOpen}
        onClose={() => {
          setHistoryModalOpen(false);
          setActiveTab('divvy');
        }}
        divvys={divvysList}
        currentDivvyId={currentDivvy?.id}
        onSelectDivvy={(id) => {
          loadDivvyDetails(id);
          setActiveTab('divvy');
        }}
        onStartNew={() => {
          setScannerModalOpen(true);
          setActiveTab('divvy');
        }}
        onDeleteDivvy={handleDeleteDivvy}
      />

      {/* Gamification Modal (Pizza Boss, Thriftiest Divver, etc.) */}
      <GamificationModal
        isOpen={gamificationModalOpen}
        onClose={() => {
          setGamificationModalOpen(false);
          setActiveTab('divvy');
        }}
        divvys={divvysList}
        currentUser={user}
      />

      {/* Payment & Settle Up Deep Links Modal */}
      <PaymentModal
        isOpen={paymentModalOpen}
        onClose={() => {
          setPaymentModalOpen(false);
          setTargetPartyForPayment(null);
        }}
        party={targetPartyForPayment}
        divvy={currentDivvy}
        totalOwedCents={split?.parties?.[targetPartyForPayment?.id]?.totalCents || 0}
        isPaid={!!targetPartyForPayment?.paidAt || !!targetPartyForPayment?.paid}
        onTogglePaid={handleTogglePaid}
        onAddToast={addToast}
      />

      {/* Active Toasts */}
      <Toast toasts={toasts} />
    </div>
  );
}
