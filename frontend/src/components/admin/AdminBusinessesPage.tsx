import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Building2, Search, MoreHorizontal, Power, Eye, Phone,
  Users, CreditCard, TrendingUp, BarChart3, Plus, ChevronRight,
  Crown, Calendar, UserCircle, ShieldCheck, Trash2,
} from 'lucide-react';
import {
  Card, CardContent,
  Button, Input, Label,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui';
import { DataTable } from '@/components/shared/data-table';
import { Pagination } from '@/components/shared/pagination';
import { StatCard } from '@/components/shared/stat-card';
import { SectionLoader } from '@/components/shared/loading';
import { ExportButton } from '@/components/shared/ExportButton';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { adminApi } from '@/lib/api';
import { formatDate, formatCurrency } from '@/utils';
import toast from 'react-hot-toast';

interface AdminBusiness {
  id: string;
  name: string;
  type: string;
  owner_name: string;
  owner_phone: string;
  gst_number?: string;
  city?: string;
  state?: string;
  plan: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  users_count: number;
  transactions_count: number;
  revenue: number;
  created_at: string;
  last_active?: string;
}

interface OwnerOption {
  id: string;
  name: string;
  phone: string;
}

interface BusinessMember {
  id: string;
  user_id?: string;
  role: string;
  is_active?: boolean;
  joined_at?: string;
  user: {
    id: string;
    name?: string;
    phone: string;
  };
}

interface BusinessDetailData {
  id: string;
  name: string;
  type?: string;
  gst_number?: string;
  pan_number?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone?: string;
  email?: string;
  is_active?: boolean;
  created_at?: string;
  business_users?: BusinessMember[];
  subscriptions?: {
    id: string;
    status: string;
    billing_cycle?: string;
    current_period_start?: string;
    current_period_end?: string;
    plan?: { id: string; name: string };
  }[];
  _count?: {
    purchases?: number;
    sales?: number;
    lots?: number;
    inventory_items?: number;
    parties?: number;
    audit_logs?: number;
  };
}

// NOTE: a hard-coded `defaultBusinesses` fixture used to be substituted whenever
// the API failed or returned nothing — an admin could not tell a broken
// backend from a healthy one. Errors now render an explicit error state.

const businessTypes = ['TRADING', 'MANUFACTURING', 'WHOLESALE', 'RETAIL', 'MANDI', 'DISTRIBUTOR', 'OTHER'];

const emptyBizForm = {
  name: '', type: 'TRADING', ownerId: '',
  phone: '', email: '', gstNumber: '', panNumber: '',
  address: '', city: '', state: '', pincode: '',
};

export default function AdminBusinessesPage() {
  const [loading, setLoading] = useState(true);
  const [businesses, setBusinesses] = useState<AdminBusiness[]>([]);
  const [meta, setMeta] = useState<{ page: number; limit: number; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean } | null>(null);
  const [page, setPage] = useState(1);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [selectedBusiness, setSelectedBusiness] = useState<AdminBusiness | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [toggleBiz, setToggleBiz] = useState<AdminBusiness | null>(null);
  const [deleteBiz, setDeleteBiz] = useState<AdminBusiness | null>(null);
  const [businessDetail, setBusinessDetail] = useState<BusinessDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Add Business dialog state
  const [showAddBiz, setShowAddBiz] = useState(false);
  const [addBizForm, setAddBizForm] = useState(emptyBizForm);
  const [addBizLoading, setAddBizLoading] = useState(false);
  const [ownerOptions, setOwnerOptions] = useState<OwnerOption[]>([]);

  // Server-driven list: page + search + status go to the API (the server
  // defaults to 20 rows — filtering only the loaded slice made real records
  // unfindable). Search is debounced.
  useEffect(() => {
    const timer = setTimeout(() => fetchBusinesses(), search ? 300 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, statusFilter]);

  useEffect(() => { setPage(1); }, [search, statusFilter]);

  const fetchBusinesses = async () => {
    try {
      setLoading(true);
      setLoadError(false);
      const res = await adminApi.businesses({
        page,
        limit: 20,
        ...(search ? { search } : {}),
        ...(statusFilter === 'ACTIVE' ? { isActive: 'true' } : {}),
        ...(statusFilter === 'SUSPENDED' ? { isActive: 'false' } : {}),
      });
      setBusinesses(res.data?.data || []);
      setMeta(res.data?.meta || null);
    } catch {
      setBusinesses([]);
      setMeta(null);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const fetchOwners = async () => {
    try {
      const res = await adminApi.users({ limit: 500 });
      const users = res.data?.data || [];
      setOwnerOptions(users.map((u: any) => ({ id: u.id, name: u.name || u.phone, phone: u.phone })));
    } catch {
      setOwnerOptions([]);
    }
  };

  const handleOpenAddBiz = () => {
    setShowAddBiz(true);
    fetchOwners();
  };

  const handleViewDetail = async (b: AdminBusiness) => {
    setSelectedBusiness(b);
    setShowDetail(true);
    setBusinessDetail(null);
    setDetailLoading(true);
    try {
      const res = await adminApi.businessDetail(b.id);
      if (res.data?.data) setBusinessDetail(res.data.data);
    } catch {
      // Fall back to basic info
    } finally {
      setDetailLoading(false);
    }
  };

  // Auto-open detail for highlighted business (from user detail drill-down)
  useEffect(() => {
    const highlightId = searchParams.get('highlight');
    if (highlightId && businesses.length > 0) {
      const biz = businesses.find(b => b.id === highlightId);
      if (biz) handleViewDetail(biz);
    }
  }, [businesses, searchParams]);

  const handleAddBusiness = async () => {
    if (!addBizForm.name.trim()) { toast.error('Business name is required'); return; }
    if (!addBizForm.ownerId) { toast.error('Please select an owner'); return; }
    try {
      setAddBizLoading(true);
      await adminApi.createBusiness({
        name: addBizForm.name.trim(),
        type: addBizForm.type,
        ownerId: addBizForm.ownerId,
        phone: addBizForm.phone.trim() || undefined,
        email: addBizForm.email.trim() || undefined,
        gstNumber: addBizForm.gstNumber.trim() || undefined,
        panNumber: addBizForm.panNumber.trim() || undefined,
        address: addBizForm.address.trim() || undefined,
        city: addBizForm.city.trim() || undefined,
        state: addBizForm.state.trim() || undefined,
        pincode: addBizForm.pincode.trim() || undefined,
      });
      toast.success('Business created successfully!');
      setShowAddBiz(false);
      setAddBizForm(emptyBizForm);
      fetchBusinesses();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to create business');
    } finally {
      setAddBizLoading(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!toggleBiz) return;
    try {
      const newStatus = toggleBiz.status === 'ACTIVE';
      await adminApi.toggleBusiness(toggleBiz.id, !newStatus);
      toast.success(newStatus ? 'Business suspended' : 'Business activated');
      setToggleBiz(null);
      fetchBusinesses();
    } catch {
      toast.error('Failed to update business status');
    }
  };

  const handleDeleteBusiness = async () => {
    if (!deleteBiz) return;
    try {
      await adminApi.deleteBusiness(deleteBiz.id);
      toast.success(`Business "${deleteBiz.name}" deleted`);
      setDeleteBiz(null);
      fetchBusinesses();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to delete business');
    }
  };

  const filtered = businesses.filter((b) => {
    const matchSearch = !search ||
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.owner_name.toLowerCase().includes(search.toLowerCase()) ||
      b.city?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || b.status === statusFilter;
    const matchPlan = planFilter === 'all' || b.plan === planFilter;
    return matchSearch && matchStatus && matchPlan;
  });

  const totalRevenue = businesses.reduce((s, b) => s + b.revenue, 0);
  const activeBiz = businesses.filter(b => b.status === 'ACTIVE').length;

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-emerald-500/10 text-emerald-500',
    INACTIVE: 'bg-gray-500/10 text-gray-500',
    SUSPENDED: 'bg-red-500/10 text-red-500',
  };

  const columns = [
    {
      key: 'name', header: 'Business',
      render: (b: AdminBusiness) => (
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building2 className="h-4 w-4 text-primary" />
          </div>
          <div>
            <span className="font-medium">{b.name}</span>
            <span className="text-xs text-muted-foreground block">{b.type} · {b.city || 'N/A'}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'owner', header: 'Owner',
      render: (b: AdminBusiness) => (
        <div>
          <span className="text-sm">{b.owner_name}</span>
          <span className="text-xs text-muted-foreground block">{b.owner_phone}</span>
        </div>
      ),
    },
    {
      key: 'plan', header: 'Plan',
      render: (b: AdminBusiness) => {
        const planColors: Record<string, string> = {
          Free: 'bg-gray-500/10 text-gray-400',
          Pro: 'bg-blue-500/10 text-blue-400',
          Enterprise: 'bg-purple-500/10 text-purple-400',
        };
        return <span className={`px-2 py-1 rounded text-xs font-medium ${planColors[b.plan] || 'bg-muted text-muted-foreground'}`}>{b.plan}</span>;
      },
    },
    {
      key: 'users_count', header: 'Users',
      render: (b: AdminBusiness) => (
        <div className="flex items-center gap-1">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{b.users_count}</span>
        </div>
      ),
    },
    {
      key: 'transactions_count', header: 'Transactions',
      render: (b: AdminBusiness) => b.transactions_count.toLocaleString(),
    },
    {
      key: 'revenue', header: 'Revenue',
      render: (b: AdminBusiness) => <span className="font-medium">{formatCurrency(b.revenue)}</span>,
    },
    {
      key: 'status', header: 'Status',
      render: (b: AdminBusiness) => (
        <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[b.status]}`}>
          {b.status}
        </span>
      ),
    },
    {
      key: 'actions', header: '',
      render: (b: AdminBusiness) => (
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleViewDetail(b)}>
                <Eye className="h-4 w-4 mr-2" /> View Details
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className={b.status === 'ACTIVE' ? 'text-red-400' : 'text-emerald-400'}
                onClick={() => setToggleBiz(b)}
              >
                <Power className="h-4 w-4 mr-2" />
                {b.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-500" onClick={() => setDeleteBiz(b)}>
                <Trash2 className="h-4 w-4 mr-2" /> Delete Business
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  if (loading) return <SectionLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="h-7 w-7 text-purple-500" />
          <div>
            <h2 className="text-2xl font-bold">Business Management</h2>
            <p className="text-muted-foreground">Monitor and manage all platform businesses</p>
          </div>
        </div>
        <Button onClick={handleOpenAddBiz} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Business
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Businesses" value={meta?.total ?? businesses.length} icon={Building2} iconColor="text-purple-400" />
        <StatCard title="Active" value={activeBiz} icon={TrendingUp} iconColor="text-emerald-400" />
        <StatCard title="Total Revenue" value={formatCurrency(totalRevenue)} icon={BarChart3} iconColor="text-amber-400" />
        <StatCard title="Avg. Revenue/Biz" value={formatCurrency(businesses.length ? totalRevenue / businesses.length : 0)} icon={CreditCard} iconColor="text-blue-400" />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              icon={<Search className="h-4 w-4" />}
              placeholder="Search businesses..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="SUSPENDED">Suspended</SelectItem>
              </SelectContent>
            </Select>
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Plans</SelectItem>
                <SelectItem value="Free">Free</SelectItem>
                <SelectItem value="Pro">Pro</SelectItem>
                <SelectItem value="Enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto">
              <ExportButton
                data={filtered}
                columns={['name', 'type', 'owner_name', 'owner_phone', 'plan', 'status', 'users_count', 'transactions_count', 'revenue']}
                filename="admin_businesses"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Load error — distinct from a genuinely empty list */}
      {loadError && (
        <Card className="border-red-500/30">
          <CardContent className="p-4 flex items-center justify-between">
            <p className="text-sm text-red-400">Couldn't load businesses — the data shown may be incomplete.</p>
            <Button variant="outline" size="sm" onClick={fetchBusinesses}>Retry</Button>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <DataTable
        columns={columns}
        data={filtered}
        onRowClick={(b) => handleViewDetail(b)}
      />
      {meta && <Pagination meta={meta} onPageChange={setPage} />}

      {/* ─── Add Business Dialog ─── */}
      <Dialog open={showAddBiz} onOpenChange={(v) => { if (!v) { setShowAddBiz(false); setAddBizForm(emptyBizForm); } }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Add New Business
            </DialogTitle>
            <DialogDescription>
              Manually register a business on the platform (e.g. for cash/offline customers).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label>Business Name <span className="text-red-400">*</span></Label>
                <Input
                  placeholder="e.g. Sharma Trading Co."
                  value={addBizForm.name}
                  onChange={(e) => setAddBizForm({ ...addBizForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Business Type</Label>
                <Select value={addBizForm.type} onValueChange={(v) => setAddBizForm({ ...addBizForm, type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {businessTypes.map((t) => (
                      <SelectItem key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Owner <span className="text-red-400">*</span></Label>
                <Select value={addBizForm.ownerId} onValueChange={(v) => setAddBizForm({ ...addBizForm, ownerId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select owner..." />
                  </SelectTrigger>
                  <SelectContent>
                    {ownerOptions.length === 0 ? (
                      <SelectItem value="__none" disabled>No users found — create a user first</SelectItem>
                    ) : (
                      ownerOptions.map((o) => (
                        <SelectItem key={o.id} value={o.id}>{o.name} ({o.phone})</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  placeholder="Business phone"
                  value={addBizForm.phone}
                  onChange={(e) => setAddBizForm({ ...addBizForm, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  placeholder="business@example.com"
                  value={addBizForm.email}
                  onChange={(e) => setAddBizForm({ ...addBizForm, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>GST Number</Label>
                <Input
                  placeholder="27AABCS1429B1ZR"
                  value={addBizForm.gstNumber}
                  onChange={(e) => setAddBizForm({ ...addBizForm, gstNumber: e.target.value.toUpperCase() })}
                />
              </div>
              <div className="space-y-2">
                <Label>PAN Number</Label>
                <Input
                  placeholder="ABCDE1234F"
                  value={addBizForm.panNumber}
                  onChange={(e) => setAddBizForm({ ...addBizForm, panNumber: e.target.value.toUpperCase() })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input
                placeholder="Street address"
                value={addBizForm.address}
                onChange={(e) => setAddBizForm({ ...addBizForm, address: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>City</Label>
                <Input
                  placeholder="City"
                  value={addBizForm.city}
                  onChange={(e) => setAddBizForm({ ...addBizForm, city: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>State</Label>
                <Input
                  placeholder="State"
                  value={addBizForm.state}
                  onChange={(e) => setAddBizForm({ ...addBizForm, state: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Pincode</Label>
                <Input
                  placeholder="110001"
                  value={addBizForm.pincode}
                  maxLength={6}
                  onChange={(e) => setAddBizForm({ ...addBizForm, pincode: e.target.value.replace(/\D/g, '') })}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowAddBiz(false); setAddBizForm(emptyBizForm); }}>
              Cancel
            </Button>
            <Button onClick={handleAddBusiness} disabled={addBizLoading} className="gap-2">
              {addBizLoading ? (
                <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {addBizLoading ? 'Creating...' : 'Create Business'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Business Detail Dialog — shows members, subscriptions & stats */}
      <Dialog open={showDetail} onOpenChange={(v) => !v && setShowDetail(false)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedBusiness && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  {selectedBusiness.name}
                </DialogTitle>
                <DialogDescription>{selectedBusiness.type} · {selectedBusiness.city || 'N/A'}, {selectedBusiness.state || 'N/A'}</DialogDescription>
              </DialogHeader>
              <div className="space-y-5 mt-2">
                {/* Status + plan */}
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[selectedBusiness.status]}`}>
                    {selectedBusiness.status}
                  </span>
                  {(() => {
                    const planColors: Record<string, string> = {
                      Free: 'bg-gray-500/10 text-gray-400',
                      Pro: 'bg-blue-500/10 text-blue-400',
                      Enterprise: 'bg-purple-500/10 text-purple-400',
                    };
                    return (
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${planColors[selectedBusiness.plan] || 'bg-muted text-muted-foreground'}`}>
                        <Crown className="h-3 w-3 inline mr-1" />{selectedBusiness.plan} Plan
                      </span>
                    );
                  })()}
                </div>

                {/* Basic info grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Owner</p>
                    <p className="font-medium">{selectedBusiness.owner_name}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs flex items-center gap-1"><Phone className="h-3 w-3" /> Phone</p>
                    <p className="font-mono text-xs">{selectedBusiness.owner_phone}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Location</p>
                    <p className="font-medium">{selectedBusiness.city || 'N/A'}, {selectedBusiness.state || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">GST</p>
                    <p className="font-mono text-xs">{selectedBusiness.gst_number || businessDetail?.gst_number || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Revenue</p>
                    <p className="font-medium text-emerald-400">{formatCurrency(selectedBusiness.revenue)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs flex items-center gap-1"><Calendar className="h-3 w-3" /> Created</p>
                    <p>{formatDate(selectedBusiness.created_at)}</p>
                  </div>
                </div>

                {/* Activity stats (from detail) */}
                {businessDetail?._count && (
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {[
                      { label: 'Purchases', value: businessDetail._count.purchases },
                      { label: 'Sales', value: businessDetail._count.sales },
                      { label: 'Lots', value: businessDetail._count.lots },
                      { label: 'Inventory', value: businessDetail._count.inventory_items },
                      { label: 'Parties', value: businessDetail._count.parties },
                      { label: 'Audit Logs', value: businessDetail._count.audit_logs },
                    ].map((s) => (
                      <Card key={s.label} className="bg-muted/20">
                        <CardContent className="p-2 text-center">
                          <p className="text-lg font-bold">{s.value ?? 0}</p>
                          <p className="text-[10px] text-muted-foreground">{s.label}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Active subscription */}
                {businessDetail?.subscriptions && businessDetail.subscriptions.length > 0 && (
                  <Card className="bg-muted/20">
                    <CardContent className="p-3">
                      <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                        <CreditCard className="h-3 w-3" /> SUBSCRIPTIONS
                      </p>
                      <div className="space-y-1.5">
                        {businessDetail.subscriptions.slice(0, 3).map((sub) => (
                          <div key={sub.id} className="flex items-center justify-between text-sm">
                            <span className="font-medium">{sub.plan?.name || '—'} ({sub.billing_cycle?.replace(/_/g, ' ')})</span>
                            <div className="flex items-center gap-2">
                              {sub.current_period_start && sub.current_period_end && (
                                <span className="text-xs text-muted-foreground">
                                  {formatDate(sub.current_period_start)} → {formatDate(sub.current_period_end)}
                                </span>
                              )}
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${sub.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-gray-500/10 text-gray-400'}`}>
                                {sub.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Members / Users in this business */}
                <div>
                  <p className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Users className="h-4 w-4 text-blue-400" />
                    Team Members ({businessDetail?.business_users?.length ?? selectedBusiness.users_count})
                  </p>

                  {detailLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <span className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                      <span className="ml-2 text-sm text-muted-foreground">Loading members...</span>
                    </div>
                  ) : businessDetail?.business_users && businessDetail.business_users.length > 0 ? (
                    <div className="space-y-2">
                      {businessDetail.business_users.map((bu) => {
                        const roleColors: Record<string, string> = {
                          OWNER: 'bg-amber-500/10 text-amber-500',
                          MANAGER: 'bg-blue-500/10 text-blue-400',
                          ACCOUNTANT: 'bg-purple-500/10 text-purple-400',
                          STAFF: 'bg-gray-500/10 text-gray-400',
                        };
                        const roleIcons: Record<string, React.ReactNode> = {
                          OWNER: <Crown className="h-3 w-3" />,
                          MANAGER: <ShieldCheck className="h-3 w-3" />,
                          ACCOUNTANT: <BarChart3 className="h-3 w-3" />,
                          STAFF: <UserCircle className="h-3 w-3" />,
                        };
                        return (
                          <Card
                            key={bu.id}
                            className="cursor-pointer hover:bg-muted/40 transition-colors"
                            onClick={() => {
                              setShowDetail(false);
                              navigate(`/admin/users?highlight=${bu.user.id}`);
                            }}
                          >
                            <CardContent className="p-3 flex items-center gap-3">
                              <div className="h-9 w-9 rounded-full bg-blue-500/10 flex items-center justify-center text-sm font-bold text-blue-400 shrink-0">
                                {(bu.user.name || bu.user.phone).charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-sm truncate">{bu.user.name || 'Unnamed'}</p>
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold flex items-center gap-0.5 ${roleColors[bu.role] || roleColors.STAFF}`}>
                                    {roleIcons[bu.role]}
                                    {bu.role}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground font-mono">{bu.user.phone}</p>
                              </div>
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  ) : (
                    <Card className="bg-muted/20">
                      <CardContent className="p-4 text-center text-sm text-muted-foreground">
                        <Users className="h-6 w-6 mx-auto mb-1 opacity-40" />
                        No team members found
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setShowDetail(false)}>Close</Button>
                <Button
                  variant={selectedBusiness.status === 'ACTIVE' ? 'destructive' : 'default'}
                  onClick={() => { setShowDetail(false); setToggleBiz(selectedBusiness); }}
                >
                  <Power className="h-4 w-4 mr-2" />
                  {selectedBusiness.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Toggle Confirm */}
      <ConfirmDialog
        open={!!toggleBiz}
        onClose={() => setToggleBiz(null)}
        onConfirm={handleToggleStatus}
        title={toggleBiz?.status === 'ACTIVE' ? 'Suspend Business' : 'Activate Business'}
        description={
          toggleBiz?.status === 'ACTIVE'
            ? `Suspend "${toggleBiz?.name}"? Users won't be able to access this business.`
            : `Activate "${toggleBiz?.name}"? It will be available to its users again.`
        }
        confirmLabel={toggleBiz?.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
        variant={toggleBiz?.status === 'ACTIVE' ? 'danger' : 'default'}
      />

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteBiz}
        onClose={() => setDeleteBiz(null)}
        onConfirm={handleDeleteBusiness}
        title="Delete Business"
        description={`Permanently delete "${deleteBiz?.name}"? This will remove all its data including transactions, subscriptions, and invoices. This action cannot be undone.`}
        confirmLabel="Delete Business"
        variant="danger"
      />
    </div>
  );
}
