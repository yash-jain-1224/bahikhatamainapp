import React, { useCallback, useEffect, useState } from 'react';
import {
  Building2, Plus, Trash2, Star, Edit2, CreditCard,
  Upload, FileSpreadsheet, Check, X, AlertCircle,
  Search,
} from 'lucide-react';
import {
  Button, Input, Card, CardContent, CardHeader, CardTitle, CardDescription,
  Label, Switch,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Badge,
} from '@/components/ui';
import { businessApi } from '@/lib/api';
import { useAppSelector } from '@/hooks';
import { formatCurrency, formatDate } from '@/utils';
import toast from 'react-hot-toast';

interface BankAccount {
  id: string;
  account_name: string;
  account_number: string;
  ifsc_code: string;
  bank_name: string;
  upi_id?: string;
  is_default: boolean;
}

interface StatementRow {
  id: string;
  date: string;
  narration: string;
  debit: number;
  credit: number;
  balance: number;
  reference: string;
  matchStatus: 'unmatched' | 'matched' | 'created';
  matchedEntryId: string | null;
}

// ─── Bank Account Form Dialog ─────────────────────────────────────────────────

function BankAccountDialog({ open, onClose, onSuccess, editAccount }: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editAccount?: BankAccount | null;
}) {
  const { currentBusiness } = useAppSelector(s => s.business);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    accountName: editAccount?.account_name || '',
    accountNumber: editAccount?.account_number || '',
    ifscCode: editAccount?.ifsc_code || '',
    bankName: editAccount?.bank_name || '',
    upiId: editAccount?.upi_id || '',
    isDefault: editAccount?.is_default || false,
  });

  useEffect(() => {
    if (editAccount) {
      setForm({
        accountName: editAccount.account_name,
        accountNumber: editAccount.account_number,
        ifscCode: editAccount.ifsc_code,
        bankName: editAccount.bank_name,
        upiId: editAccount.upi_id || '',
        isDefault: editAccount.is_default,
      });
    } else {
      setForm({ accountName: '', accountNumber: '', ifscCode: '', bankName: '', upiId: '', isDefault: false });
    }
  }, [editAccount, open]);

  const handleSave = async () => {
    if (!form.accountName.trim() || !form.accountNumber.trim() || !form.ifscCode.trim() || !form.bankName.trim()) {
      toast.error('Please fill all required fields');
      return;
    }
    try {
      setSaving(true);
      if (editAccount) {
        await businessApi.updateBankAccount(currentBusiness!.id, editAccount.id, form);
        toast.success('Bank account updated');
      } else {
        await businessApi.createBankAccount(currentBusiness!.id, form);
        toast.success('Bank account added');
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
            {editAccount ? 'Edit Bank Account' : 'Add Bank Account'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Account Holder Name *</Label>
            <Input placeholder="e.g. V Phase Trading" value={form.accountName} onChange={e => setForm(f => ({ ...f, accountName: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Bank Name *</Label>
              <Input placeholder="e.g. SBI, HDFC" value={form.bankName} onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>IFSC Code *</Label>
              <Input placeholder="e.g. SBIN0001234" value={form.ifscCode} onChange={e => setForm(f => ({ ...f, ifscCode: e.target.value.toUpperCase() }))} maxLength={11} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Account Number *</Label>
            <Input placeholder="e.g. 1234567890123" value={form.accountNumber} onChange={e => setForm(f => ({ ...f, accountNumber: e.target.value.replace(/\D/g, '') }))} />
          </div>
          <div className="space-y-2">
            <Label>UPI ID (optional)</Label>
            <Input placeholder="e.g. business@upi" value={form.upiId} onChange={e => setForm(f => ({ ...f, upiId: e.target.value }))} />
          </div>
          <div className="flex items-center justify-between pt-2">
            <div>
              <p className="text-sm font-medium">Set as Default</p>
              <p className="text-xs text-muted-foreground">Use as primary bank account</p>
            </div>
            <Switch checked={form.isDefault} onCheckedChange={v => setForm(f => ({ ...f, isDefault: v }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : editAccount ? 'Update' : 'Add Account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Statement Match Row ──────────────────────────────────────────────────────

function StatementMatchRow({ row, onMatch, onCreateNew }: {
  row: StatementRow;
  onMatch: (row: StatementRow) => void;
  onCreateNew: (row: StatementRow) => void;
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
        <p className="text-[10px] text-muted-foreground">Bal: {formatCurrency(row.balance)}</p>
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

export default function BusinessBankSection() {
  const { currentBusiness } = useAppSelector(s => s.business);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editAccount, setEditAccount] = useState<BankAccount | null>(null);
  const [showStatement, setShowStatement] = useState(false);
  const [statementRows, setStatementRows] = useState<StatementRow[]>([]);
  const [parsing, setParsing] = useState(false);

  const fetchAccounts = useCallback(async () => {
    if (!currentBusiness) return;
    try {
      setLoading(true);
      setLoadError(false);
      const { data } = await businessApi.listBankAccounts(currentBusiness.id);
      setAccounts(data?.data || []);
    } catch {
      // A failed list must never render as "No bank accounts added yet".
      setLoadError(true);
    } finally { setLoading(false); }
  }, [currentBusiness]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this bank account?')) return;
    try {
      await businessApi.deleteBankAccount(currentBusiness!.id, id);
      toast.success('Bank account deleted');
      fetchAccounts();
    } catch {
      toast.error('Failed to delete');
    }
  };

  // ─── Statement CSV parsing ──────────────────────────────────────────────────

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Only CSV for now
    if (!file.name.endsWith('.csv')) {
      toast.error('Please upload a CSV file');
      return;
    }

    setParsing(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) { toast.error('CSV file is empty'); setParsing(false); return; }

      // Parse CSV — try to auto-detect columns
      const header = lines[0].toLowerCase();
      const rows: any[] = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        if (cols.length < 4) continue;

        // Common bank statement formats:
        // Date, Narration/Description, Debit, Credit, Balance
        // OR Date, Ref, Description, Debit, Credit, Balance
        let date = '', narration = '', debit = 0, credit = 0, balance = 0, reference = '';

        if (header.includes('narration') || header.includes('description')) {
          // Standard format: Date, Narration, Debit, Credit, Balance
          date = cols[0];
          narration = cols[1];
          debit = parseFloat(cols[2]) || 0;
          credit = parseFloat(cols[3]) || 0;
          balance = parseFloat(cols[4]) || 0;
          reference = cols[5] || '';
        } else {
          // Generic: assume Date, Ref, Description, Debit, Credit, Balance
          date = cols[0];
          reference = cols[1] || '';
          narration = cols[2] || cols[1];
          debit = parseFloat(cols[3]) || 0;
          credit = parseFloat(cols[4]) || 0;
          balance = parseFloat(cols[5]) || 0;
        }

        if (date && (debit || credit)) {
          rows.push({ date, narration, debit, credit, balance, reference });
        }
      }

      if (rows.length === 0) {
        toast.error('No valid entries found in CSV');
        setParsing(false);
        return;
      }

      // Send to backend for parsing/validation
      const { data } = await businessApi.parseStatement(currentBusiness!.id, rows);
      setStatementRows(data?.data || rows.map((r, i) => ({ ...r, id: `stmt-${i}`, matchStatus: 'unmatched', matchedEntryId: null })));
      setShowStatement(true);
      toast.success(`${rows.length} entries loaded from statement`);
    } catch (err: any) {
      toast.error('Failed to parse CSV: ' + (err.message || 'Unknown error'));
    } finally {
      setParsing(false);
    }
  };

  const handleMatch = async (row: StatementRow) => {
    try {
      const amount = row.debit || row.credit;
      const type = row.debit > 0 ? 'debit' : 'credit';
      const { data } = await businessApi.findMatches(currentBusiness!.id, {
        date: row.date, amount, type, narration: row.narration,
      });

      const matches = data?.data || [];
      if (matches.length === 0) {
        toast('No matching entries found. You can create a new entry.', { icon: '🔍' });
        return;
      }

      // Auto-match with the first result for now
      const match = matches[0];
      await businessApi.reconcileEntry(currentBusiness!.id, { ledgerEntryId: match.id });

      setStatementRows(prev => prev.map(r =>
        r.id === row.id ? { ...r, matchStatus: 'matched', matchedEntryId: match.id } : r
      ));
      toast.success(`Matched with ${match.purchase?.purchase_number || match.sale?.sale_number || match.narration || 'entry'}`);
    } catch {
      toast.error('Failed to find matches');
    }
  };

  const handleCreateNew = async (row: StatementRow) => {
    try {
      const amount = row.debit || row.credit;
      const type = row.debit > 0 ? 'debit' : 'credit';
      await businessApi.reconcileEntry(currentBusiness!.id, {
        date: row.date,
        amount,
        type,
        narration: row.narration,
        accountType: 'BANK',
      });

      setStatementRows(prev => prev.map(r =>
        r.id === row.id ? { ...r, matchStatus: 'created' } : r
      ));
      toast.success('New ledger entry created');
    } catch {
      toast.error('Failed to create entry');
    }
  };

  const matchedCount = statementRows.filter(r => r.matchStatus !== 'unmatched').length;

  return (
    <div className="space-y-6">
      {/* Bank Accounts Card */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" /> Bank Accounts
            </CardTitle>
            <CardDescription>Manage your business bank accounts</CardDescription>
          </div>
          <Button size="sm" onClick={() => { setEditAccount(null); setShowAdd(true); }}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Account
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Loading...</div>
          ) : loadError ? (
            <div className="py-8 text-center">
              <p className="text-sm text-red-400 mb-3">Couldn't load bank accounts.</p>
              <Button variant="outline" size="sm" onClick={fetchAccounts}>Retry</Button>
            </div>
          ) : accounts.length === 0 ? (
            <div className="py-8 text-center">
              <Building2 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No bank accounts added yet</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowAdd(true)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Your First Account
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border">
              {accounts.map(acc => (
                <div key={acc.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{acc.bank_name}</p>
                      {acc.is_default && (
                        <Badge variant="default" className="text-[9px] px-1.5 py-0">
                          <Star className="h-2.5 w-2.5 mr-0.5" /> Default
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">{acc.account_number} · IFSC: {acc.ifsc_code}</p>
                    <p className="text-xs text-muted-foreground">{acc.account_name}{acc.upi_id ? ` · UPI: ${acc.upi_id}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditAccount(acc); setShowAdd(true); }}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-500" onClick={() => handleDelete(acc.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bank Statement Upload Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" /> Bank Statement Reconciliation
          </CardTitle>
          <CardDescription>Upload bank statement CSV to match & reconcile with your ledger entries</CardDescription>
        </CardHeader>
        <CardContent>
          {!showStatement ? (
            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors">
              <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium mb-1">Upload Bank Statement (CSV)</p>
              <p className="text-xs text-muted-foreground mb-4">
                Format: Date, Narration, Debit, Credit, Balance
              </p>
              <label className="inline-flex">
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={parsing}
                />
                <Button variant="outline" size="sm" asChild disabled={parsing}>
                  <span>
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    {parsing ? 'Parsing...' : 'Choose CSV File'}
                  </span>
                </Button>
              </label>
              <p className="text-[10px] text-muted-foreground mt-3">
                Supported: CSV exports from SBI, HDFC, ICICI, Axis, Kotak, and most Indian banks
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Summary bar */}
              <div className="flex items-center justify-between px-3 py-2 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium">{statementRows.length} entries</span>
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
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setShowStatement(false); setStatementRows([]); }}>
                    <X className="h-3 w-3 mr-1" /> Close
                  </Button>
                  <label className="inline-flex">
                    <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
                    <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                      <span><Upload className="h-3 w-3 mr-1" /> New File</span>
                    </Button>
                  </label>
                </div>
              </div>

              {/* Statement entries */}
              <div className="border border-border rounded-lg max-h-[400px] overflow-y-auto">
                {statementRows.map(row => (
                  <StatementMatchRow
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
                  <p className="text-xs text-muted-foreground mt-1">Your bank statement matches your ledger.</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <BankAccountDialog
        open={showAdd}
        onClose={() => { setShowAdd(false); setEditAccount(null); }}
        onSuccess={fetchAccounts}
        editAccount={editAccount}
      />
    </div>
  );
}
