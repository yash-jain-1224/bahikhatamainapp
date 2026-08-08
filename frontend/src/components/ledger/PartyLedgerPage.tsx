import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Phone, Mail, IndianRupee,
  ArrowDownLeft, ArrowUpRight, Send, RefreshCw,
} from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui';
import { StatCard } from '@/components/shared/stat-card';
import { SectionLoader } from '@/components/shared/loading';
import { RecordPaymentDialog } from '@/components/shared/RecordPaymentDialog';
import { ExportButton } from '@/components/shared/ExportButton';
import AccessDeniedPage from '@/components/shared/AccessDeniedPage';
import { ledgerApi, notificationApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/utils';
import type { LedgerEntry, Party } from '@/types';
import toast from 'react-hot-toast';

export default function PartyLedgerPage() {
  const { partyId } = useParams<{ partyId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation(['ledger', 'common']);
  const [party, setParty] = useState<Party | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [closingBalance, setClosingBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  // HTTP status of the last failed fetch, or null. A bare `catch {}` used to
  // swallow everything, so a 403 rendered as a silently-empty statement.
  const [loadError, setLoadError] = useState<number | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);

  useEffect(() => {
    if (partyId) fetchData();
  }, [partyId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      // Use the statement endpoint, not partyLedger. partyLedger returns one
      // paginated page ordered newest-first, and this page then accumulated a
      // running balance over it — so the column ran backwards (the newest row
      // showed only its own amount, the oldest showed the total) and the totals
      // in the footer only ever covered the first page. The statement endpoint
      // returns the complete set oldest-first with the balance already carried.
      const res = await ledgerApi.partyStatement(partyId!);
      // Note the shape difference: getPartyLedger's controller spreads its
      // result (`{ success, party, data, meta }`) but getPartyStatement nests it
      // (`{ success, data: { party, statement, closingBalance } }`). Reading the
      // spread shape here silently produced an empty statement and a null party.
      const data = res.data?.data;
      if (data) {
        setParty(data.party || null);
        // The server already restricts this to purchase/sale/payment/manual
        // references, so no second filter is needed here.
        const rows: LedgerEntry[] = (data.statement || []).map((e: any) => ({
          ...e,
          running_balance: Number(e.runningBalance ?? 0),
        }));
        setEntries(rows);
        setClosingBalance(Number(data.closingBalance ?? 0));
      }
    } catch (err: any) {
      setParty(null);
      setEntries([]);
      setClosingBalance(null);
      setLoadError(err?.response?.status ?? 0);
    } finally {
      setLoading(false);
    }
  };

  const handleSendReminder = async () => {
    try {
      const res = await notificationApi.sendReminder(partyId!);
      const result = res.data?.data;
      // Newer backend returns { sent: boolean, reason?: string }; a missing
      // `sent` field is a legacy response and means success.
      if (result?.sent === false) {
        const reasonMessages: Record<string, string> = {
          NO_PHONE: t('ledger:reminder_no_phone', 'Party has no phone number'),
          NOT_RECEIVABLE: t('ledger:reminder_not_receivable', 'No outstanding balance to remind about'),
          WHATSAPP_UNCONFIGURED: t('ledger:reminder_whatsapp_unconfigured', 'WhatsApp is not configured'),
          SEND_FAILED: t('ledger:reminder_send_failed', 'WhatsApp send failed'),
        };
        toast.error(
          (result.reason && reasonMessages[result.reason]) ||
            t('ledger:reminder_failed', 'Could not send the reminder'),
        );
        return;
      }
      toast.success(t('ledger:reminder_sent'));
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message || t('ledger:reminder_failed', 'Could not send the reminder'),
      );
    }
  };

  const totalDebit = entries.filter(e => e.entry_type === 'DEBIT').reduce((s, e) => s + Number(e.amount), 0);
  const totalCredit = entries.filter(e => e.entry_type === 'CREDIT').reduce((s, e) => s + Number(e.amount), 0);
  // Prefer the server's closing balance; it is derived from the same rows and
  // avoids the totals and the last row of the table ever disagreeing.
  const netBalance = closingBalance ?? (totalDebit - totalCredit);

  // running_balance now arrives from the server, already accumulated in date
  // order across the whole statement.
  const entriesWithBalance = entries as (LedgerEntry & { running_balance: number })[];

  if (loading) return <SectionLoader />;

  // A 403 means the user lacks the ledger permission — say so instead of
  // rendering an empty statement; any other failure gets an explicit retry panel.
  if (loadError === 403) return <AccessDeniedPage />;
  if (loadError !== null) {
    return (
      <div className="text-center py-16 space-y-4">
        <p className="text-muted-foreground">{t('common:something_wrong')}</p>
        <Button variant="outline" onClick={() => fetchData()}>
          <RefreshCw className="h-4 w-4 mr-2" /> {t('common:retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/parties')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold">{party?.name || 'Party'}</h2>
              {party?.type && (
                <Badge variant={party.type === 'SUPPLIER' ? 'default' : party.type === 'CUSTOMER' ? 'success' : 'warning'}>
                  {party.type}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground flex items-center gap-3 mt-1">
              {party?.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {party.phone}</span>}
              {party?.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {party.email}</span>}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {/* Without data/columns the button rendered but every format only
              toasted "Nothing to export". Project the statement rows the
              table itself renders. */}
          <ExportButton
            label={t('ledger:export_statement')}
            data={entriesWithBalance.map(e => ({
              entry_date: formatDate(e.entry_date),
              narration: e.narration || '',
              account_type: e.account_type,
              entry_type: e.entry_type,
              amount: Number(e.amount),
              running_balance: e.running_balance,
            }))}
            columns={['entry_date', 'narration', 'account_type', 'entry_type', 'amount', 'running_balance']}
            filename={`statement_${(party?.name || 'party').replace(/\s+/g, '_')}`}
          />
          <Button variant="outline" size="sm" onClick={handleSendReminder}>
            <Send className="h-4 w-4 mr-2" /> {t('ledger:send_reminder')}
          </Button>
          <Button size="sm" onClick={() => setPaymentOpen(true)}>
            <IndianRupee className="h-4 w-4 mr-2" /> {t('common:record_payment')}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title={t('ledger:total_debit')} value={formatCurrency(totalDebit)} icon={ArrowUpRight} iconColor="text-red-400" />
        <StatCard title={t('ledger:total_credit')} value={formatCurrency(totalCredit)} icon={ArrowDownLeft} iconColor="text-emerald-400" />
        <StatCard
          title={netBalance >= 0 ? t('ledger:you_owe') : t('ledger:they_owe')}
          value={formatCurrency(Math.abs(netBalance))}
          icon={IndianRupee}
          iconColor={netBalance >= 0 ? 'text-red-400' : 'text-emerald-400'}
        />
      </div>

      {/* Ledger Table */}
      <Card className="glass">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">{t('ledger:ledger_statement')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t('ledger:date_col')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t('ledger:narration_col')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t('ledger:type_col')}</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">{t('ledger:debit')}</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">{t('ledger:credit')}</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">{t('ledger:balance_col')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entriesWithBalance.map((e) => (
                  <tr key={e.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-sm">{formatDate(e.entry_date)}</td>
                    <td className="px-4 py-3 text-sm">{e.narration}</td>
                    <td className="px-4 py-3"><span className="text-xs px-2 py-1 rounded bg-muted">{e.account_type.replace('_', ' ')}</span></td>
                    <td className="px-4 py-3 text-sm text-right">{e.entry_type === 'DEBIT' ? <span className="text-red-400 font-semibold">{formatCurrency(e.amount)}</span> : '-'}</td>
                    <td className="px-4 py-3 text-sm text-right">{e.entry_type === 'CREDIT' ? <span className="text-emerald-400 font-semibold">{formatCurrency(e.amount)}</span> : '-'}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold">
                      <span className={e.running_balance >= 0 ? 'text-red-400' : 'text-emerald-400'}>
                        {formatCurrency(Math.abs(e.running_balance))} {e.running_balance >= 0 ? t('ledger:dr_label') : t('ledger:cr_label')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/30">
                  <td colSpan={3} className="px-4 py-3 text-sm font-semibold">{t('ledger:total_footer')}</td>
                  <td className="px-4 py-3 text-sm font-bold text-right text-red-400">{formatCurrency(totalDebit)}</td>
                  <td className="px-4 py-3 text-sm font-bold text-right text-emerald-400">{formatCurrency(totalCredit)}</td>
                  <td className="px-4 py-3 text-sm font-bold text-right">
                    <span className={netBalance >= 0 ? 'text-red-400' : 'text-emerald-400'}>
                      {formatCurrency(Math.abs(netBalance))} {netBalance >= 0 ? t('ledger:dr_label') : t('ledger:cr_label')}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      <RecordPaymentDialog
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        onSuccess={() => fetchData()}
        defaultPartyId={partyId}
        defaultType={party?.type === 'SUPPLIER' ? 'OUT' : 'IN'}
      />
    </div>
  );
}
