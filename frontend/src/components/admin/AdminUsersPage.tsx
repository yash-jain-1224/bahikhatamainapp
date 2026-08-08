import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Users, Search, MoreHorizontal, Shield, ShieldOff,
  Ban, CheckCircle, Mail, Phone, UserPlus, Building2,
  ChevronRight, Eye, Crown, Calendar, Trash2,
} from 'lucide-react';
import {
  Card, CardContent,
  Button, Input, Label,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Switch,
} from '@/components/ui';
import { DataTable } from '@/components/shared/data-table';
import { Pagination } from '@/components/shared/pagination';
import { SectionLoader } from '@/components/shared/loading';
import { ExportButton } from '@/components/shared/ExportButton';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { adminApi } from '@/lib/api';
import { formatDate } from '@/utils';
import toast from 'react-hot-toast';

interface UserBusiness {
  id: string;
  business_id?: string;
  role: string;
  is_active?: boolean;
  joined_at?: string;
  business: {
    id: string;
    name: string;
    type?: string;
    city?: string;
    state?: string;
    is_active?: boolean;
  };
  permissions?: { permission: string }[];
}

interface UserDetail {
  id: string;
  name: string;
  phone: string;
  email?: string;
  avatar_url?: string;
  is_active: boolean;
  is_super_admin: boolean;
  created_at: string;
  profile?: {
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    pan_number?: string;
  };
  business_users?: UserBusiness[];
  _count?: {
    referrals_made?: number;
    notifications?: number;
  };
}

interface AdminUser {
  id: string;
  name: string;
  phone: string;
  email?: string;
  businesses: number;
  plan: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  is_super_admin: boolean;
  created_at: string;
  last_login?: string;
}

// NOTE: a hard-coded `defaultUsers` fixture used to be substituted whenever
// the API failed or returned nothing — an admin could not tell a broken
// backend from a healthy one. Errors now render an explicit error state.

const emptyUserForm = { name: '', phone: '', email: '', isSuperAdmin: false };

export default function AdminUsersPage() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [meta, setMeta] = useState<{ page: number; limit: number; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean } | null>(null);
  const [page, setPage] = useState(1);
  const [loadError, setLoadError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [showUserDetail, setShowUserDetail] = useState(false);
  const [userDetail, setUserDetail] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Add User dialog state
  const [showAddUser, setShowAddUser] = useState(false);
  const [addUserForm, setAddUserForm] = useState(emptyUserForm);
  const [addUserLoading, setAddUserLoading] = useState(false);

  // Confirm action state
  const [confirmAction, setConfirmAction] = useState<{ type: 'suspend' | 'activate' | 'makeAdmin' | 'removeAdmin' | 'delete'; user: AdminUser } | null>(null);

  // Server-driven list: page + search + status go to the API (the server
  // defaults to 20 rows — filtering only the loaded slice made real records
  // unfindable). Search is debounced.
  useEffect(() => {
    const timer = setTimeout(() => fetchUsers(), searchQuery ? 300 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, searchQuery, statusFilter]);

  useEffect(() => { setPage(1); }, [searchQuery, statusFilter]);

  // Auto-open detail for highlighted user (from business detail drill-down)
  useEffect(() => {
    const highlightId = searchParams.get('highlight');
    if (highlightId && users.length > 0) {
      const user = users.find(u => u.id === highlightId);
      if (user) handleViewUser(user);
    }
  }, [users, searchParams]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setLoadError(false);
      const res = await adminApi.users({
        page,
        limit: 20,
        ...(searchQuery ? { search: searchQuery } : {}),
        ...(statusFilter === 'ACTIVE' ? { isActive: 'true' } : {}),
        ...(statusFilter === 'SUSPENDED' ? { isActive: 'false' } : {}),
      });
      setUsers(res.data?.data || []);
      setMeta(res.data?.meta || null);
    } catch {
      setUsers([]);
      setMeta(null);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async () => {
    if (!addUserForm.name.trim() || !addUserForm.phone.trim()) {
      toast.error('Name and phone are required');
      return;
    }
    if (!/^\d{10}$/.test(addUserForm.phone.trim())) {
      toast.error('Please enter a valid 10-digit phone number');
      return;
    }
    try {
      setAddUserLoading(true);
      await adminApi.createUser({
        name: addUserForm.name.trim(),
        phone: addUserForm.phone.trim(),
        email: addUserForm.email.trim() || undefined,
        isSuperAdmin: addUserForm.isSuperAdmin,
      });
      toast.success('User created successfully!');
      setShowAddUser(false);
      setAddUserForm(emptyUserForm);
      fetchUsers();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to create user');
    } finally {
      setAddUserLoading(false);
    }
  };

  const handleViewUser = async (u: AdminUser) => {
    setSelectedUser(u);
    setShowUserDetail(true);
    setUserDetail(null);
    setDetailLoading(true);
    try {
      const res = await adminApi.userDetail(u.id);
      if (res.data?.data) setUserDetail(res.data.data);
    } catch {
      // Will fall back to basic info from AdminUser
    } finally {
      setDetailLoading(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    const { type, user } = confirmAction;
    try {
      switch (type) {
        case 'suspend':
          await adminApi.toggleUser(user.id, false);
          toast.success(`User "${user.name}" suspended`);
          break;
        case 'activate':
          await adminApi.toggleUser(user.id, true);
          toast.success(`User "${user.name}" activated`);
          break;
        case 'makeAdmin':
          await adminApi.toggleSuperAdmin(user.id, true);
          toast.success(`User "${user.name}" is now a super admin`);
          break;
        case 'removeAdmin':
          await adminApi.toggleSuperAdmin(user.id, false);
          toast.success(`Admin privileges removed from "${user.name}"`);
          break;
        case 'delete':
          await adminApi.deleteUser(user.id);
          toast.success(`User "${user.name}" deleted`);
          break;
      }
      setConfirmAction(null);
      fetchUsers();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || `Failed to ${type} user`);
    }
  };

  const confirmTitle: Record<string, string> = {
    suspend: 'Suspend User',
    activate: 'Activate User',
    makeAdmin: 'Grant Admin Access',
    removeAdmin: 'Remove Admin Access',
    delete: 'Delete User',
  };

  const confirmDesc = (action: typeof confirmAction) => {
    if (!action) return '';
    const { type, user } = action;
    switch (type) {
      case 'suspend': return `Suspend "${user.name}"? They will not be able to log in.`;
      case 'activate': return `Activate "${user.name}"? They will be able to log in again.`;
      case 'makeAdmin': return `Grant super admin privileges to "${user.name}"? They will have full platform access.`;
      case 'removeAdmin': return `Remove admin privileges from "${user.name}"?`;
      case 'delete': return `Permanently delete user "${user.name}"? This action cannot be undone and will remove all their data.`;
      default: return '';
    }
  };
      
  const filteredUsers = users.filter((u) => {
    const matchSearch = !searchQuery || 
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.phone.includes(searchQuery) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = statusFilter === 'all' || u.status === statusFilter;
    const matchPlan = planFilter === 'all' || u.plan === planFilter;
    return matchSearch && matchStatus && matchPlan;
  });

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-emerald-500/10 text-emerald-500',
    INACTIVE: 'bg-gray-500/10 text-gray-500',
    SUSPENDED: 'bg-red-500/10 text-red-500',
  };

  const columns = [
    {
      key: 'name',
      header: 'User',
      render: (u: AdminUser) => (
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
            {u.name.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-medium">{u.name}</span>
              {u.is_super_admin && <Shield className="h-3.5 w-3.5 text-red-500" />}
            </div>
            <span className="text-xs text-muted-foreground">{u.email || u.phone}</span>
          </div>
        </div>
      ),
    },
    { key: 'phone', header: 'Phone', render: (u: AdminUser) => <span className="font-mono text-sm">{u.phone}</span> },
    { key: 'businesses', header: 'Businesses', render: (u: AdminUser) => <span className="font-medium">{u.businesses}</span> },
    {
      key: 'plan',
      header: 'Plan',
      render: (u: AdminUser) => (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">{u.plan}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (u: AdminUser) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[u.status] || ''}`}>
          {u.status}
        </span>
      ),
    },
    {
      key: 'created_at',
      header: 'Joined',
      render: (u: AdminUser) => <span className="text-sm text-muted-foreground">{formatDate(u.created_at)}</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (u: AdminUser) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleViewUser(u)}>
              <Eye className="h-4 w-4 mr-2" /> View Details
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {u.status === 'ACTIVE' ? (
              <DropdownMenuItem className="text-red-500" onClick={() => setConfirmAction({ type: 'suspend', user: u })}>
                <Ban className="h-4 w-4 mr-2" /> Suspend User
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem className="text-emerald-500" onClick={() => setConfirmAction({ type: 'activate', user: u })}>
                <CheckCircle className="h-4 w-4 mr-2" /> Activate User
              </DropdownMenuItem>
            )}
            {!u.is_super_admin ? (
              <DropdownMenuItem onClick={() => setConfirmAction({ type: 'makeAdmin', user: u })}>
                <Shield className="h-4 w-4 mr-2" /> Make Admin
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => setConfirmAction({ type: 'removeAdmin', user: u })}>
                <ShieldOff className="h-4 w-4 mr-2" /> Remove Admin
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-red-500" onClick={() => setConfirmAction({ type: 'delete', user: u })}>
              <Trash2 className="h-4 w-4 mr-2" /> Delete User
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  if (loading) return <SectionLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-7 w-7 text-blue-500" />
          <div>
            <h2 className="text-2xl font-bold">User Management</h2>
            <p className="text-muted-foreground">{meta?.total ?? users.length} total users</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setShowAddUser(true)} className="gap-2">
            <UserPlus className="h-4 w-4" />
            Add User
          </Button>
          <ExportButton
            label="Export Users"
            data={filteredUsers}
            columns={['name', 'phone', 'email', 'businesses', 'plan', 'status', 'created_at']}
            filename="admin_users"
          />
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, phone, or email..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="SUSPENDED">Suspended</SelectItem>
              </SelectContent>
            </Select>
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Plans</SelectItem>
                <SelectItem value="Free">Free</SelectItem>
                <SelectItem value="Pro">Pro</SelectItem>
                <SelectItem value="Enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Load error — distinct from a genuinely empty list */}
      {loadError && (
        <Card className="border-red-500/30">
          <CardContent className="p-4 flex items-center justify-between">
            <p className="text-sm text-red-400">Couldn't load users — the data shown may be incomplete.</p>
            <Button variant="outline" size="sm" onClick={fetchUsers}>Retry</Button>
          </CardContent>
        </Card>
      )}

      {/* Users Table */}
      <DataTable
        columns={columns}
        data={filteredUsers}
        emptyMessage="No users found matching your filters"
      />
      {meta && <Pagination meta={meta} onPageChange={setPage} />}

      {/* ─── Add User Dialog ─── */}
      <Dialog open={showAddUser} onOpenChange={(v) => { if (!v) { setShowAddUser(false); setAddUserForm(emptyUserForm); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Add New User
            </DialogTitle>
            <DialogDescription>
              Manually create a user account (e.g. for cash/offline customers who don't sign up themselves).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name <span className="text-red-400">*</span></Label>
              <Input
                placeholder="Enter full name"
                value={addUserForm.name}
                onChange={(e) => setAddUserForm({ ...addUserForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Phone Number <span className="text-red-400">*</span></Label>
              <Input
                placeholder="10-digit mobile number"
                value={addUserForm.phone}
                maxLength={10}
                onChange={(e) => setAddUserForm({ ...addUserForm, phone: e.target.value.replace(/\D/g, '') })}
              />
            </div>
            <div className="space-y-2">
              <Label>Email (optional)</Label>
              <Input
                type="email"
                placeholder="email@example.com"
                value={addUserForm.email}
                onChange={(e) => setAddUserForm({ ...addUserForm, email: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="text-sm font-medium">Super Admin</Label>
                <p className="text-xs text-muted-foreground">Grant full platform admin access</p>
              </div>
              <Switch
                checked={addUserForm.isSuperAdmin}
                onCheckedChange={(v) => setAddUserForm({ ...addUserForm, isSuperAdmin: v })}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowAddUser(false); setAddUserForm(emptyUserForm); }}>
              Cancel
            </Button>
            <Button onClick={handleAddUser} disabled={addUserLoading} className="gap-2">
              {addUserLoading ? (
                <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              {addUserLoading ? 'Creating...' : 'Create User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User Detail Dialog — shows businesses & drill-down */}
      <Dialog open={showUserDetail} onOpenChange={setShowUserDetail}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
            <DialogDescription>Complete user information, businesses & roles</DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-5">
              {/* User header */}
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">
                  {selectedUser.name.charAt(0)}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-lg">{selectedUser.name}</h3>
                    {selectedUser.is_super_admin && (
                      <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 text-xs font-semibold flex items-center gap-1">
                        <Shield className="h-3 w-3" /> Admin
                      </span>
                    )}
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[selectedUser.status]}`}>
                    {selectedUser.status}
                  </span>
                </div>
              </div>

              {/* Basic info grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs flex items-center gap-1"><Phone className="h-3 w-3" /> Phone</p>
                  <p className="font-mono">{selectedUser.phone}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs flex items-center gap-1"><Mail className="h-3 w-3" /> Email</p>
                  <p>{selectedUser.email || userDetail?.email || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs flex items-center gap-1"><Crown className="h-3 w-3" /> Plan</p>
                  <p className="font-medium">{selectedUser.plan}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs flex items-center gap-1"><Building2 className="h-3 w-3" /> Businesses</p>
                  <p className="font-medium">{userDetail?.business_users?.length ?? selectedUser.businesses}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs flex items-center gap-1"><Calendar className="h-3 w-3" /> Joined</p>
                  <p>{formatDate(selectedUser.created_at)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Last Login</p>
                  <p>{selectedUser.last_login ? formatDate(selectedUser.last_login) : '—'}</p>
                </div>
              </div>

              {/* Profile info (if fetched) */}
              {userDetail?.profile && (
                <Card className="bg-muted/20">
                  <CardContent className="p-3">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">PROFILE</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                      {userDetail.profile.city && (
                        <div><p className="text-xs text-muted-foreground">City</p><p>{userDetail.profile.city}</p></div>
                      )}
                      {userDetail.profile.state && (
                        <div><p className="text-xs text-muted-foreground">State</p><p>{userDetail.profile.state}</p></div>
                      )}
                      {userDetail.profile.pincode && (
                        <div><p className="text-xs text-muted-foreground">Pincode</p><p>{userDetail.profile.pincode}</p></div>
                      )}
                      {userDetail.profile.pan_number && (
                        <div><p className="text-xs text-muted-foreground">PAN</p><p className="font-mono text-xs">{userDetail.profile.pan_number}</p></div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Businesses list */}
              <div>
                <p className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-purple-400" />
                  Businesses ({userDetail?.business_users?.length ?? selectedUser.businesses})
                </p>

                {detailLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <span className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    <span className="ml-2 text-sm text-muted-foreground">Loading businesses...</span>
                  </div>
                ) : userDetail?.business_users && userDetail.business_users.length > 0 ? (
                  <div className="space-y-2">
                    {userDetail.business_users.map((bu) => {
                      const roleColors: Record<string, string> = {
                        OWNER: 'bg-amber-500/10 text-amber-500',
                        MANAGER: 'bg-blue-500/10 text-blue-400',
                        ACCOUNTANT: 'bg-purple-500/10 text-purple-400',
                        STAFF: 'bg-gray-500/10 text-gray-400',
                      };
                      return (
                        <Card
                          key={bu.id}
                          className="cursor-pointer hover:bg-muted/40 transition-colors"
                          onClick={() => {
                            setShowUserDetail(false);
                            navigate(`/admin/businesses?highlight=${bu.business.id}`);
                          }}
                        >
                          <CardContent className="p-3 flex items-center gap-3">
                            <div className="h-9 w-9 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
                              <Building2 className="h-4 w-4 text-purple-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm truncate">{bu.business.name}</p>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${roleColors[bu.role] || roleColors.STAFF}`}>
                                  {bu.role}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {[bu.business.type, bu.business.city, bu.business.state].filter(Boolean).join(' · ') || 'No location'}
                                {bu.joined_at && ` · Joined ${formatDate(bu.joined_at)}`}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {bu.permissions && (
                                <span className="text-[10px] text-muted-foreground">{bu.permissions.length} perms</span>
                              )}
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <Card className="bg-muted/20">
                    <CardContent className="p-4 text-center text-sm text-muted-foreground">
                      <Building2 className="h-6 w-6 mx-auto mb-1 opacity-40" />
                      No businesses associated with this user
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Referral + Notification stats */}
              {userDetail?._count && (
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  {userDetail._count.referrals_made !== undefined && (
                    <span>Referrals made: <strong className="text-foreground">{userDetail._count.referrals_made}</strong></span>
                  )}
                  {userDetail._count.notifications !== undefined && (
                    <span>Notifications: <strong className="text-foreground">{userDetail._count.notifications}</strong></span>
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUserDetail(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Action Dialog */}
      <ConfirmDialog
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleConfirmAction}
        title={confirmAction ? confirmTitle[confirmAction.type] : ''}
        description={confirmDesc(confirmAction)}
        confirmLabel={confirmAction ? confirmTitle[confirmAction.type] : 'Confirm'}
        variant={confirmAction?.type === 'delete' || confirmAction?.type === 'suspend' ? 'danger' : 'default'}
      />
    </div>
  );
}
