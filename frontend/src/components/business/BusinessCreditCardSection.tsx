import React, { useCallback, useEffect, useState } from 'react';
import {
  CreditCard, Plus, Trash2, Edit2, Upload, FileSpreadsheet,
  Check, X, AlertCircle, Search, Calendar, IndianRupee,
} from 'lucide-react';
import {
  Button, Input, Card, CardContent, CardHeader, CardTitle, CardDescription,
  Label,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Badge,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui';
import { businessApi } from '@/lib/api';
import { useAppSelector } from '@/hooks';
import { formatCurrency, formatDate } from '@/utils';
import toast from 'react-hot-toast';

interface CreditCardData {
  id: string;
  card_name: string;
  card_number: string;
  card_network: string;
  bank_name: string;
  card_holder?: string;
  billing_date?: number;
  due_date?: number;
  credit_limit?: number;
  current_balance: number;
  is_active: boolean;
}

interface CCStatementRow {
  id: string;
  date: string;
  narration: string;
  debit: number;
  credit: number;
  reference: string;
  matchStatus: 'unmatched' | 'matched' | 'created';
  matchedEntryId: string | null;
}

const CARD_NETWORKS = ['VISA', 'MASTERCARD', 'RUPAY', 'AMEX', 'DINERS'] as const;

// ─── Credit Card Form Dialog ──────────────────────────────────────────────────

function CreditCardDialog({ open, onClose, onSuccess, editCard }: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editCard?: CreditCardData | null;
}) {
  const { currentBusiness } = useAppSelector(s => s.business);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    cardName: '',
    cardNumber: '',
    cardNetwork: 'VISA',
    bankName: '',
    cardHolder: '',
    billingDate: '',
    dueDate: '',
    creditLimit: '',
  });

  useEffect(() => {
    if (editCard) {
      setForm({
        cardName: editCard.card_name,
        cardNumber: editCard.card_number,
        cardNetwork: editCard.card_network,
        bankName: editCard.bank_name,
        cardHolder: editCard.card_holder || '',
        billingDate: editCard.billing_date?.toString() || '',
        dueDate: editCard.due_date?.toString() || '',
        creditLimit: editCard.credit_limit?.toString() || '',
      });
    } else {
      setForm({
        cardName: '', cardNumber: '', cardNetwork: 'VISA', bankName: '',
        cardHolder: '', billingDate: '', dueDate: '', creditLimit: '',
      });
    }
  }, [editCard, open]);

  const handleSave = async () => {
    if (!form.cardName.trim() || !form.cardNumber.trim() || !form.bankName.trim()) {
      toast.error('Please fill Card Name, Last 4 Digits, and Bank Name');
      return;
    }
    if (form.cardNumber.length > 4 || !/^\d+$/.test(form.cardNumber)) {
      toast.error('Enter only the last 4 digits of the card');
      return;
    }
    try {
      setSaving(true);
      const payload = {
        cardName: form.cardName,
        cardNumber: form.cardNumber,
        cardNetwork: form.cardNetwork,
        bankName: form.bankName,
        // Explicit null (not undefined) for cleared fields — undefined keys
        // are dropped by JSON.stringify, so "keep old value" and "clear the
        // field" were indistinguishable and clearing was impossible.
        cardHolder: form.cardHolder.trim() || null,
        billingDate: form.billingDate ? parseInt(form.billingDate) : null,
        dueDate: form.dueDate ? parseInt(form.dueDate) : null,
        creditLimit: form.creditLimit ? parseFloat(form.creditLimit) : null,
      };

      if (editCard) {
        await businessApi.updateCreditCard(currentBusiness!.id, editCard.id, payload);
        toast.success('Credit card updated');
      } else {
        await businessApi.createCreditCard(currentBusiness!.id, payload);
        toast.success('Credit card added');
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            {editCard ? 'Edit Credit Card' : 'Add Credit Card'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Card Name *</Label>
            <Input
              placeholder="e.g. HDFC Regalia, SBI SimplyClick"
              value={form.cardName}
              onChange={e => setForm(f => ({ ...f, cardName: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Last 4 Digits *</Label>
              <Input
                placeholder="e.g. 4321"
                value={form.cardNumber}
                onChange={e => setForm(f => ({ ...f, cardNumber: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                maxLength={4}
              />
            </div>
            <div className="space-y-2">
              <Label>Card Network</Label>
              <Select value={form.cardNetwork} onValueChange={v => setForm(f => ({ ...f, cardNetwork: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CARD_NETWORKS.map(n => (
                    <SelectItem key={n} value={n}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Issuing Bank *</Label>
              <Input
                placeholder="e.g. HDFC, SBI"
                value={form.bankName}
                onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Card Holder</Label>
              <Input
                placeholder="Name on card"
                value={form.cardHolder}
                onChange={e => setForm(f => ({ ...f, cardHolder: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Billing Date</Label>
              <Input
                type="number"
                placeholder="1-31"
                min={1} max={31}
                value={form.billingDate}
                onChange={e => setForm(f => ({ ...f, billingDate: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input
                type="number"
                placeholder="1-31"
                min={1} max={31}
                value={form.dueDate}
                onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Credit Limit</Label>
              <Input
                type="number"
                placeholder="₹ Limit"
                value={form.creditLimit}
                onChange={e => setForm(f => ({ ...f, creditLimit: e.target.value }))}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : editCard ? 'Update' : 'Add Card'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Statement Match Row ──────────────────────────────────────────────────────

function CCStatementMatchRow({ row, onMatch, onCreateNew }: {
  row: CCStatementRow;
  onMatch: (row: CCStatementRow) => void;
  onCreateNew: (row: CCStatementRow) => void;
}) {
  const amount = row.debit || row.credit;
  const isDebit = row.debit > 0;

  return (
    <div className={`flex items-center gap-3 px-4 py-3 border-b border-border/50 last:border-0 transition-colors ${
      row.matchStatus === 'matched' ? 'bg-emerald-500/5' : row.matchStatus === 'created' ? 'bg-blue-500/5' : 'hover:bg-muted/30'
    }`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{formatDate(row.date)}</span>
          {row.matchStatus === 'matched' && <Badge variant="success" className="text-[9px]">Matched</Badge>}
          {row.matchStatus === 'created' && <Badge className="text-[9px] bg-blue-500/10 text-blue-400 border-blue-500/30">New Entry</Badge>}
        </div>
        <p className="text-sm font-medium truncate mt-0.5">{row.narration}</p>
        {row.reference && <p className="text-xs text-muted-foreground">Ref: {row.reference}</p>}
      </div>
      <div className="text-right shrink-0">
        <p className={`text-sm font-bold ${isDebit ? 'text-red-400' : 'text-emerald-400'}`}>
          {isDebit ? '−' : '+'}{formatCurrency(amount)}
        </p>
      </div>
      {row.matchStatus === 'unmatched' && (
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onMatch(row)}>
            <Search className="h-3 w-3 mr-1" /> Match
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-blue-400" onClick={() => onCreateNew(row)}>
            <Plus className="h-3 w-3 mr-1" /> Create
          </Button>
        </div>
      )}
      {row.matchStatus !== 'unmatched' && (
        <Check className="h-4 w-4 text-emerald-400 shrink-0" />
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BusinessCreditCardSection() {
  const { currentBusiness } = useAppSelector(s => s.business);
  const [cards, setCards] = useState<CreditCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editCard, setEditCard] = useState<CreditCardData | null>(null);

  // Statement reconciliation state
  const [selectedCard, setSelectedCard] = useState<CreditCardData | null>(null);
  const [showStatement, setShowStatement] = useState(false);
  const [statementRows, setStatementRows] = useState<CCStatementRow[]>([]);
  const [parsing, setParsing] = useState(false);

  const fetchCards = useCallback(async () => {
    if (!currentBusiness) return;
    try {
      setLoading(true);
      setLoadError(false);
      const { data } = await businessApi.listCreditCards(currentBusiness.id);
      setCards(data?.data || []);
    } catch {
      // A failed list must never render as "No credit cards added yet" —
      // during an outage existing cards would appear deleted.
      setLoadError(true);
    } finally { setLoading(false); }
  }, [currentBusiness]);

  useEffect(() => { fetchCards(); }, [fetchCards]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this credit card? It will be marked as inactive.')) return;
    try {
      await businessApi.deleteCreditCard(currentBusiness!.id, id);
      toast.success('Credit card removed');
      fetchCards();
    } catch {
      toast.error('Failed to delete');
    }
  };

  // ─── Statement CSV Parsing ──────────────────────────────────────────────────

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, card: CreditCardData) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast.error('Please upload a CSV file');
      return;
    }

    setParsing(true);
    setSelectedCard(card);
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) { toast.error('CSV file is empty'); setParsing(false); return; }

      const header = lines[0].toLowerCase();
      const rows: any[] = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        if (cols.length < 3) continue;

        let date = '', narration = '', debit = 0, credit = 0, reference = '';

        if (header.includes('narration') || header.includes('description') || header.includes('particular')) {
          // Standard: Date, Narration, Debit/Amount, Credit
          date = cols[0];
          narration = cols[1];
          debit = parseFloat(cols[2]) || 0;
          credit = parseFloat(cols[3]) || 0;
          reference = cols[4] || '';
        } else {
          // Generic: Date, Ref, Description, Amount
          date = cols[0];
          reference = cols[1] || '';
          narration = cols[2] || cols[1];
          debit = parseFloat(cols[3]) || 0;
          credit = parseFloat(cols[4]) || 0;
        }

        if (date && (debit || credit)) {
          rows.push({ date, narration, debit, credit, reference });
        }
      }

      if (rows.length === 0) {
        toast.error('No valid entries found in CSV');
        setParsing(false);
        return;
      }

      const { data } = await businessApi.parseCreditCardStatement(currentBusiness!.id, rows);
      setStatementRows(data?.data || rows.map((r, i) => ({
        ...r, id: `cc-stmt-${i}`, matchStatus: 'unmatched', matchedEntryId: null,
      })));
      setShowStatement(true);
      toast.success(`${rows.length} entries loaded from CC statement`);
    } catch (err: any) {
      toast.error('Failed to parse CSV: ' + (err.message || 'Unknown error'));
    } finally {
      setParsing(false);
    }
  };

  const handleMatch = async (row: CCStatementRow) => {
    try {
      const amount = row.debit || row.credit;
      const type = row.debit > 0 ? 'debit' : 'credit';
      const { data } = await businessApi.findCreditCardMatches(currentBusiness!.id, {
        date: row.date, amount, type, narration: row.narration,
      });

      const matches = data?.data || [];
      if (matches.length === 0) {
        toast('No matching entries found. You can create a new entry.', { icon: '🔍' });
        return;
      }

      // Auto-match with the first result
      const match = matches[0];
      await businessApi.reconcileCreditCardEntry(currentBusiness!.id, selectedCard!.id, {
        ledgerEntryId: match.id,
      });

      setStatementRows(prev => prev.map(r =>
        r.id === row.id ? { ...r, matchStatus: 'matched', matchedEntryId: match.id } : r
      ));
      toast.success(`Matched with ${match.purchase?.purchase_number || match.sale?.sale_number || match.narration || 'entry'}`);
    } catch {
      toast.error('Failed to find matches');
    }
  };

  const handleCreateNew = async (row: CCStatementRow) => {
    try {
      const amount = row.debit || row.credit;
      const type = row.debit > 0 ? 'debit' : 'credit';
      await businessApi.reconcileCreditCardEntry(currentBusiness!.id, selectedCard!.id, {
        date: row.date,
        amount,
        type,
        narration: row.narration,
      });

      setStatementRows(prev => prev.map(r =>
        r.id === row.id ? { ...r, matchStatus: 'created' } : r
      ));
      toast.success('New ledger entry created');
      // Refresh cards to see updated balance
      fetchCards();
    } catch {
      toast.error('Failed to create entry');
    }
  };

  const matchedCount = statementRows.filter(r => r.matchStatus !== 'unmatched').length;

  const getNetworkColor = (network: string) => {
    switch (network) {
      case 'VISA': return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'MASTERCARD': return 'bg-orange-500/10 text-orange-400 border-orange-500/30';
      case 'RUPAY': return 'bg-green-500/10 text-green-400 border-green-500/30';
      case 'AMEX': return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      default: return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
    }
  };

  const getUtilization = (card: CreditCardData) => {
    if (!card.credit_limit || card.credit_limit <= 0) return null;
    return Math.round((card.current_balance / card.credit_limit) * 100);
  };

  return (
    <div className="space-y-6">
      {/* Credit Cards Card */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" /> Credit Cards
            </CardTitle>
            <CardDescription>Manage your business credit cards and track expenses</CardDescription>
          </div>
          <Button size="sm" onClick={() => { setEditCard(null); setShowAdd(true); }}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Card
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Loading...</div>
          ) : loadError ? (
            <div className="py-8 text-center">
              <p className="text-sm text-red-400 mb-3">Couldn't load credit cards.</p>
              <Button variant="outline" size="sm" onClick={fetchCards}>Retry</Button>
            </div>
          ) : cards.length === 0 ? (
            <div className="py-8 text-center">
              <CreditCard className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No credit cards added yet</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowAdd(true)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Your First Card
              </Button>
            </div>
          ) : (
            <div className="grid gap-3">
              {cards.map(card => {
                const utilization = getUtilization(card);
                return (
                  <div key={card.id} className="relative border border-border rounded-xl p-4 hover:bg-muted/20 transition-colors group">
                    {/* Card header row */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0">
                          <CreditCard className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold">{card.card_name}</p>
                            <Badge className={`text-[9px] px-1.5 py-0 ${getNetworkColor(card.card_network)}`}>
                              {card.card_network}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {card.bank_name} •••• {card.card_number}
                            {card.card_holder ? ` · ${card.card_holder}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <label className="inline-flex">
                          <input
                            type="file"
                            accept=".csv"
                            className="hidden"
                            onChange={e => handleFileUpload(e, card)}
                            disabled={parsing}
                          />
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Upload Statement" asChild>
                            <span><Upload className="h-3.5 w-3.5" /></span>
                          </Button>
                        </label>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditCard(card); setShowAdd(true); }}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-500" onClick={() => handleDelete(card.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Card stats row */}
                    <div className="flex items-center gap-4 mt-3 pl-[52px]">
                      <div className="flex items-center gap-1.5">
                        <IndianRupee className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Outstanding:</span>
                        <span className={`text-xs font-semibold ${card.current_balance > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                          {formatCurrency(Number(card.current_balance))}
                        </span>
                      </div>
                      {card.credit_limit && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">Limit:</span>
                          <span className="text-xs font-medium">{formatCurrency(Number(card.credit_limit))}</span>
                        </div>
                      )}
                      {utilization !== null && (
                        <div className="flex items-center gap-1.5">
                          <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                utilization > 80 ? 'bg-red-400' : utilization > 50 ? 'bg-amber-400' : 'bg-emerald-400'
                              }`}
                              style={{ width: `${Math.min(utilization, 100)}%` }}
                            />
                          </div>
                          <span className={`text-[10px] font-medium ${
                            utilization > 80 ? 'text-red-400' : utilization > 50 ? 'text-amber-400' : 'text-emerald-400'
                          }`}>{utilization}%</span>
                        </div>
                      )}
                      {card.billing_date && (
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground">
                            Bill: {card.billing_date}th · Due: {card.due_date || '—'}th
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Credit Card Statement Reconciliation Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" /> Credit Card Statement Reconciliation
          </CardTitle>
          <CardDescription>
            Upload credit card statement CSV to match & reconcile with your ledger entries.
            Click the upload icon on any card above, or upload here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!showStatement ? (
            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors">
              <CreditCard className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium mb-1">Upload Credit Card Statement (CSV)</p>
              <p className="text-xs text-muted-foreground mb-4">
                Format: Date, Description, Debit/Spend, Credit/Payment
              </p>
              {cards.length > 0 ? (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-xs text-muted-foreground">Select a card and upload via the card's upload icon above</p>
                  <p className="text-[10px] text-muted-foreground">
                    Or pick a card to upload for:
                  </p>
                  <div className="flex flex-wrap justify-center gap-2 mt-1">
                    {cards.map(card => (
                      <label key={card.id} className="inline-flex">
                        <input
                          type="file"
                          accept=".csv"
                          className="hidden"
                          onChange={e => handleFileUpload(e, card)}
                          disabled={parsing}
                        />
                        <Button variant="outline" size="sm" className="text-xs" asChild>
                          <span>
                            <CreditCard className="h-3 w-3 mr-1" />
                            {card.card_name} (••{card.card_number})
                          </span>
                        </Button>
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Add a credit card first to upload statements</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Summary bar */}
              <div className="flex items-center justify-between px-3 py-2 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium">
                    {selectedCard?.card_name} (••{selectedCard?.card_number}) · {statementRows.length} entries
                  </span>
                  <Badge variant="success" className="text-[10px]">
                    <Check className="h-2.5 w-2.5 mr-0.5" /> {matchedCount} reconciled
                  </Badge>
                  {statementRows.length - matchedCount > 0 && (
                    <Badge variant="warning" className="text-[10px]">
                      <AlertCircle className="h-2.5 w-2.5 mr-0.5" /> {statementRows.length - matchedCount} pending
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setShowStatement(false); setStatementRows([]); setSelectedCard(null); }}>
                    <X className="h-3 w-3 mr-1" /> Close
                  </Button>
                </div>
              </div>

              {/* Statement entries */}
              <div className="border border-border rounded-lg max-h-[400px] overflow-y-auto">
                {statementRows.map(row => (
                  <CCStatementMatchRow
                    key={row.id}
                    row={row}
                    onMatch={handleMatch}
                    onCreateNew={handleCreateNew}
                  />
                ))}
              </div>

              {matchedCount === statementRows.length && statementRows.length > 0 && (
                <div className="text-center py-4 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
                  <Check className="h-6 w-6 text-emerald-400 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-emerald-400">All entries reconciled!</p>
                  <p className="text-xs text-muted-foreground mt-1">Your credit card statement matches your ledger.</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog */}
      <CreditCardDialog
        open={showAdd}
        onClose={() => { setShowAdd(false); setEditCard(null); }}
        onSuccess={fetchCards}
        editCard={editCard}
      />
    </div>
  );
}
