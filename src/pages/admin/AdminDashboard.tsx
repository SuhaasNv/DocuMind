import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAdminMetrics,
  getAllUsers,
  getAllDocuments,
  deleteUser,
  changeUserRole,
  getJobStats,
  getRagStats,
  getSystemHealth,
  getOnlineUsers,
  type DocStatus,
  type AdminUser,
} from '@/lib/admin';
import { useAppStore } from '@/stores/useAppStore';
import {
  Users,
  FileText,
  Activity,
  Trash2,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  ShieldAlert,
  BarChart3,
  Briefcase,
  TrendingUp,
  Cpu,
  Database,
  Server,
  Layers,
  ChevronDown,
  Circle,
  Search,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ── Types & constants ─────────────────────────────────────────────────────

type Tab = 'overview' | 'users' | 'documents' | 'jobs' | 'analytics';

const PAGE_SIZE = 15;

const STATUS_CONFIG = {
  DONE: {
    label: 'Ready',
    color: 'bg-green-500/15 text-green-400 border-green-500/30',
    icon: CheckCircle2,
  },
  PROCESSING: {
    label: 'Processing',
    color: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    icon: Loader2,
  },
  PENDING: {
    label: 'Pending',
    color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    icon: Clock,
  },
  FAILED: {
    label: 'Failed',
    color: 'bg-red-500/15 text-red-400 border-red-500/30',
    icon: AlertCircle,
  },
} as const;

const JOB_STATE_CONFIG = {
  active: { label: 'Active', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  waiting: { label: 'Waiting', color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' },
  failed: { label: 'Failed', color: 'text-red-400 bg-red-500/10 border-red-500/20' },
  completed: { label: 'Completed', color: 'text-green-400 bg-green-500/10 border-green-500/20' },
  delayed: { label: 'Delayed', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────

function formatBytes(bytes?: number) {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Debounce a changing value; used for server-side search inputs. */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function timeAgo(date: string | null) {
  if (!date) return 'Never';
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(date).toLocaleDateString();
}

// ── Sub-components ────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  bg,
  loading,
  pulse,
}: {
  label: string;
  value?: number | string;
  icon: React.ElementType;
  color: string;
  bg: string;
  loading?: boolean;
  pulse?: boolean;
}) {
  return (
    <Card className={`bg-gradient-to-br ${bg} border transition-all hover:shadow-md`}>
      <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className={cn('h-4 w-4', color, pulse && 'animate-pulse')} />
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {loading ? (
          <div className="h-8 w-12 bg-muted animate-pulse rounded" />
        ) : (
          <div className={cn('text-3xl font-bold', color)}>{value ?? 0}</div>
        )}
      </CardContent>
    </Card>
  );
}

function HealthBadge({ status }: { status: 'ok' | 'error' | 'configured' | 'not_configured' | undefined }) {
  if (!status) return <span className="text-muted-foreground text-xs">-</span>;
  const ok = status === 'ok' || status === 'configured';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border',
        ok
          ? 'bg-green-500/10 text-green-400 border-green-500/20'
          : 'bg-red-500/10 text-red-400 border-red-500/20',
      )}
    >
      <Circle className={cn('w-1.5 h-1.5 fill-current', ok ? 'text-green-400' : 'text-red-400')} />
      {ok ? (status === 'configured' ? 'Configured' : 'Healthy') : 'Error'}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { accessToken, user } = useAppStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const tabFromUrl = searchParams.get('tab') as Tab | null;
  const [activeTab, setActiveTab] = useState<Tab>(
    tabFromUrl && ['overview', 'users', 'documents', 'jobs', 'analytics'].includes(tabFromUrl)
      ? tabFromUrl
      : 'overview',
  );

  // Sync tab from URL whenever it changes (e.g. sidebar deep links)
  useEffect(() => {
    if (
      tabFromUrl &&
      ['overview', 'users', 'documents', 'jobs', 'analytics'].includes(tabFromUrl)
    ) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl]);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [userPage, setUserPage] = useState(1);
  const [docPage, setDocPage] = useState(1);
  const [docStatusFilter, setDocStatusFilter] = useState<DocStatus | undefined>();
  const [jobState, setJobState] = useState<'active' | 'waiting' | 'failed' | 'completed' | 'delayed'>('active');
  const [userSearch, setUserSearch] = useState('');
  const [docSearch, setDocSearch] = useState('');
  const debouncedUserSearch = useDebouncedValue(userSearch, 300);
  const debouncedDocSearch = useDebouncedValue(docSearch, 300);

  // A new search always starts from page 1.
  useEffect(() => {
    setUserPage(1);
  }, [debouncedUserSearch]);
  useEffect(() => {
    setDocPage(1);
  }, [debouncedDocSearch]);

  const enabled = !!accessToken && user?.role === 'ADMIN';
  const isAdmin = user?.role === 'ADMIN';

  // Queries (must run unconditionally; enabled=false when not admin)
  const { data: metrics, isLoading: metricsLoading, refetch: refetchMetrics } = useQuery({
    queryKey: ['adminMetrics'],
    queryFn: () => getAdminMetrics(accessToken!),
    enabled,
    refetchInterval: 30000,
  });

  const { data: health, refetch: refetchHealth } = useQuery({
    queryKey: ['adminHealth'],
    queryFn: () => getSystemHealth(accessToken!),
    enabled,
    refetchInterval: 60000,
  });

  const { data: onlineUsers, isLoading: onlineLoading } = useQuery({
    queryKey: ['adminOnline'],
    queryFn: () => getOnlineUsers(accessToken!),
    enabled,
    refetchInterval: 15000,
  });

  const { data: usersData, isLoading: usersLoading, refetch: refetchUsers } = useQuery({
    queryKey: ['adminUsers', userPage, debouncedUserSearch],
    queryFn: () => getAllUsers(accessToken!, userPage, PAGE_SIZE, debouncedUserSearch || undefined),
    enabled,
  });

  const { data: docsData, isLoading: docsLoading, refetch: refetchDocs } = useQuery({
    queryKey: ['adminDocs', docPage, docStatusFilter, debouncedDocSearch],
    queryFn: () =>
      getAllDocuments(accessToken!, docPage, PAGE_SIZE, docStatusFilter, debouncedDocSearch || undefined),
    enabled,
  });

  const { data: jobStats, isLoading: jobsLoading, refetch: refetchJobs } = useQuery({
    queryKey: ['adminJobs'],
    queryFn: () => getJobStats(accessToken!),
    enabled,
    refetchInterval: 10000,
  });

  const { data: ragStats, isLoading: ragLoading, refetch: refetchRag } = useQuery({
    queryKey: ['adminRag'],
    queryFn: () => getRagStats(accessToken!),
    enabled,
    refetchInterval: 60000,
  });

  // Mutations
  const deleteMutation = useMutation({
    mutationFn: (userId: string) => deleteUser(accessToken!, userId),
    onSuccess: () => {
      toast.success('User deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      queryClient.invalidateQueries({ queryKey: ['adminMetrics'] });
      setDeleteUserId(null);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to delete user');
      setDeleteUserId(null);
    },
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: 'USER' | 'ADMIN' }) =>
      changeUserRole(accessToken!, userId, role),
    onSuccess: (updated) => {
      toast.success(`Role updated to ${updated.role}`);
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update role');
    },
  });

  // Redirect non-admins (after all hooks)
  useEffect(() => {
    if (!isAdmin) navigate('/app');
  }, [isAdmin, navigate]);

  const handleRefreshAll = () => {
    refetchMetrics();
    refetchHealth();
    refetchUsers();
    refetchDocs();
    refetchJobs();
    refetchRag();
    toast.info('Refreshing data…');
  };

  if (!isAdmin) return null;

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    {
      id: 'users',
      label: `Users${usersData ? ` (${usersData.total})` : ''}`,
      icon: Users,
    },
    {
      id: 'documents',
      label: `Documents${docsData ? ` (${docsData.total})` : ''}`,
      icon: FileText,
    },
    { id: 'jobs', label: 'Jobs', icon: Briefcase },
    { id: 'analytics', label: 'Analytics', icon: TrendingUp },
  ];

  return (
    <div className="flex-1 overflow-auto bg-background">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Admin Console</h1>
            <p className="text-xs text-muted-foreground">DocuMind system management</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefreshAll} className="gap-2">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </Button>
      </div>

      <div className="p-6 space-y-6">
        {/* ── Metric cards ─────────────────────────────────────────────── */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Total Users" value={metrics?.totalUsers} icon={Users} color="text-primary" bg="from-primary/10 to-primary/5 border-primary/20" loading={metricsLoading} />
          <StatCard label="Online (5 min)" value={metrics?.onlineUsers} icon={Activity} color="text-green-400" bg="from-green-500/10 to-green-500/5 border-green-500/20" loading={metricsLoading} pulse />
          <StatCard label="Documents" value={metrics?.totalDocuments} icon={FileText} color="text-blue-400" bg="from-blue-500/10 to-blue-500/5 border-blue-500/20" loading={metricsLoading} />
          <StatCard label="Chunks" value={metrics?.totalChunks} icon={Layers} color="text-indigo-400" bg="from-indigo-500/10 to-indigo-500/5 border-indigo-500/20" loading={metricsLoading} />
          <StatCard label="Active Jobs" value={metrics?.jobs.active} icon={Cpu} color="text-yellow-400" bg="from-yellow-500/10 to-yellow-500/5 border-yellow-500/20" loading={metricsLoading} />
          <StatCard label="Failed Jobs" value={metrics?.jobs.failed} icon={AlertCircle} color="text-red-400" bg="from-red-500/10 to-red-500/5 border-red-500/20" loading={metricsLoading} />
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        <div className="flex gap-1 border-b border-border overflow-x-auto">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => {
                setActiveTab(id);
                setSearchParams(id === 'overview' ? {} : { tab: id });
              }}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
                activeTab === id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            OVERVIEW TAB
        ═══════════════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* System health */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Server className="w-4 h-4" />
                  System Health
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {(
                    [
                      { label: 'Database', key: 'database', icon: Database },
                      { label: 'Redis', key: 'redis', icon: Server },
                      { label: 'Queue', key: 'queue', icon: Briefcase },
                      { label: 'LLM', key: 'llm', icon: Cpu },
                    ] as const
                  ).map(({ label, key, icon: Icon }) => (
                    <div
                      key={key}
                      className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border bg-muted/20"
                    >
                      <Icon className="w-5 h-5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{label}</span>
                      <HealthBadge status={health?.[key]} />
                    </div>
                  ))}
                </div>
                {health && (
                  <p className="text-xs text-muted-foreground mt-3">
                    Last checked: {new Date(health.timestamp).toLocaleTimeString()}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Document status breakdown */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Document Status Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {(
                    [
                      { key: 'done', label: 'Ready', color: 'text-green-400', bg: 'border-green-500/20 bg-green-500/5' },
                      { key: 'processing', label: 'Processing', color: 'text-blue-400', bg: 'border-blue-500/20 bg-blue-500/5' },
                      { key: 'pending', label: 'Pending', color: 'text-yellow-400', bg: 'border-yellow-500/20 bg-yellow-500/5' },
                      { key: 'failed', label: 'Failed', color: 'text-red-400', bg: 'border-red-500/20 bg-red-500/5' },
                    ] as const
                  ).map(({ key, label, color, bg }) => (
                    <div
                      key={key}
                      className={cn('rounded-xl border p-4 text-center', bg)}
                    >
                      <div className={cn('text-2xl font-bold', color)}>
                        {metricsLoading ? (
                          <div className="h-7 w-8 bg-muted animate-pulse rounded mx-auto" />
                        ) : (
                          metrics?.documentsByStatus?.[key] ?? 0
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{label}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Active users */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <CardTitle className="text-base">Active Users</CardTitle>
                  <span className="text-xs text-muted-foreground">(last 5 min)</span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>User</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Last Active</TableHead>
                        <TableHead>Docs</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {onlineLoading && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            Loading…
                          </TableCell>
                        </TableRow>
                      )}
                      {!onlineLoading && (!onlineUsers || onlineUsers.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            No active users in the last 5 minutes.
                          </TableCell>
                        </TableRow>
                      )}
                      {onlineUsers?.map((u) => (
                        <TableRow key={u.id} className="hover:bg-muted/30">
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                              {u.name}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">{u.email}</TableCell>
                          <TableCell>
                            <RoleBadge role={u.role} />
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm tabular-nums">
                            {timeAgo(u.lastActiveAt)}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {u._count?.documents ?? 0}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            USERS TAB
        ═══════════════════════════════════════════════════════════════ */}
        {activeTab === 'users' && (
          <Card className="border-border">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div className="flex flex-col gap-1">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    All Users
                    {usersData && (
                      <span className="text-sm font-normal text-muted-foreground">
                        · {usersData.total} total
                      </span>
                    )}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Change role or delete users from the Actions column.
                  </p>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search name or email…"
                    className="h-8 pl-8 text-sm"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Docs</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead>Last Active</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usersLoading && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          Loading…
                        </TableCell>
                      </TableRow>
                    )}
                    {!usersLoading && usersData?.users?.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No users found.
                        </TableCell>
                      </TableRow>
                    )}
                    {usersData?.users?.map((u) => (
                      <UserRow
                        key={u.id}
                        user={u}
                        currentUserId={useAppStore.getState().user?.id}
                        onDelete={() => setDeleteUserId(u.id)}
                        onRoleChange={(role) =>
                          roleMutation.mutate({ userId: u.id, role })
                        }
                        roleChangePending={roleMutation.isPending}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>

              <Pagination
                page={userPage}
                total={usersData?.total ?? 0}
                pageSize={PAGE_SIZE}
                onPage={setUserPage}
              />
            </CardContent>
          </Card>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            DOCUMENTS TAB
        ═══════════════════════════════════════════════════════════════ */}
        {activeTab === 'documents' && (
          <Card className="border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  All Documents
                  {docsData && (
                    <span className="text-sm font-normal text-muted-foreground">
                      · {docsData.total} total
                    </span>
                  )}
                </CardTitle>

                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      value={docSearch}
                      onChange={(e) => setDocSearch(e.target.value)}
                      placeholder="Search name or owner email…"
                      className="h-8 pl-8 text-sm"
                    />
                  </div>

                {/* Status filter */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      {docStatusFilter
                        ? STATUS_CONFIG[docStatusFilter].label
                        : 'All Statuses'}
                      <ChevronDown className="w-3 h-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => { setDocStatusFilter(undefined); setDocPage(1); }}
                    >
                      All Statuses
                    </DropdownMenuItem>
                    {(Object.keys(STATUS_CONFIG) as DocStatus[]).map((s) => (
                      <DropdownMenuItem
                        key={s}
                        onClick={() => { setDocStatusFilter(s); setDocPage(1); }}
                      >
                        {STATUS_CONFIG[s].label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Document</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Uploaded</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {docsLoading && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          Loading…
                        </TableCell>
                      </TableRow>
                    )}
                    {!docsLoading && docsData?.documents?.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No documents found.
                        </TableCell>
                      </TableRow>
                    )}
                    {docsData?.documents?.map((doc) => {
                      const cfg =
                        STATUS_CONFIG[doc.status as keyof typeof STATUS_CONFIG] ??
                        STATUS_CONFIG.PENDING;
                      const StatusIcon = cfg.icon;
                      return (
                        <TableRow key={doc.id} className="hover:bg-muted/30">
                          <TableCell>
                            <div className="flex items-center gap-2 max-w-xs">
                              <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                              <span className="text-sm truncate">{doc.name}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="text-sm font-medium">{doc.user?.name}</p>
                              <p className="text-xs text-muted-foreground">{doc.user?.email}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border',
                                cfg.color,
                              )}
                            >
                              <StatusIcon className="w-3 h-3" />
                              {cfg.label}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 min-w-[80px]">
                              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary rounded-full transition-all"
                                  style={{ width: `${doc.progress}%` }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground w-8 text-right">
                                {doc.progress}%
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {formatBytes(doc.size)}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {new Date(doc.uploadedAt).toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <Pagination
                page={docPage}
                total={docsData?.total ?? 0}
                pageSize={PAGE_SIZE}
                onPage={setDocPage}
              />
            </CardContent>
          </Card>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            JOBS TAB
        ═══════════════════════════════════════════════════════════════ */}
        {activeTab === 'jobs' && (
          <div className="space-y-6">
            {/* Queue state cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              {(Object.keys(JOB_STATE_CONFIG) as Array<keyof typeof JOB_STATE_CONFIG>).map(
                (state) => (
                  <button
                    key={state}
                    onClick={() => setJobState(state)}
                    className={cn(
                      'rounded-xl border p-4 text-center transition-all',
                      JOB_STATE_CONFIG[state].color,
                      jobState === state ? 'ring-2 ring-primary/50' : 'opacity-70 hover:opacity-100',
                    )}
                  >
                    <div className="text-2xl font-bold">
                      {jobsLoading ? (
                        <div className="h-7 w-6 bg-muted animate-pulse rounded mx-auto" />
                      ) : (
                        jobStats?.counts?.[state] ?? 0
                      )}
                    </div>
                    <div className="text-xs mt-1">{JOB_STATE_CONFIG[state].label}</div>
                  </button>
                ),
              )}
            </div>

            {jobStats?.error && (
              <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-4 py-3 text-sm text-yellow-400">
                Queue unavailable: {jobStats.error}
              </div>
            )}

            {/* Job list */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Briefcase className="w-4 h-4" />
                  {JOB_STATE_CONFIG[jobState].label} Jobs
                  <span className="text-sm font-normal text-muted-foreground">
                    · {jobStats?.counts?.[jobState] ?? 0}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>ID</TableHead>
                        <TableHead>Job Name</TableHead>
                        <TableHead>Document</TableHead>
                        <TableHead>Attempts</TableHead>
                        <TableHead>
                          {jobState === 'failed' ? 'Failed Reason' : 'Queued At'}
                        </TableHead>
                        {jobState === 'completed' && <TableHead>Finished</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobsLoading && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            Loading…
                          </TableCell>
                        </TableRow>
                      )}
                      {!jobsLoading &&
                        (jobStats?.jobs?.[jobState]?.length ?? 0) === 0 && (
                          <TableRow>
                            <TableCell
                              colSpan={6}
                              className="text-center py-8 text-muted-foreground"
                            >
                              No {jobState} jobs.
                            </TableCell>
                          </TableRow>
                        )}
                      {jobStats?.jobs?.[jobState]?.map((job) => (
                        <TableRow key={job.id} className="hover:bg-muted/30">
                          <TableCell className="text-muted-foreground text-xs font-mono">
                            {job.id ?? '-'}
                          </TableCell>
                          <TableCell className="text-sm">{job.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground font-mono truncate max-w-[140px]">
                            {(job.data as { documentId?: string })?.documentId ?? '-'}
                          </TableCell>
                          <TableCell className="text-sm">{job.attemptsMade}</TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[220px] truncate">
                            {jobState === 'failed'
                              ? (job.failedReason ?? '-')
                              : new Date(job.timestamp).toLocaleString()}
                          </TableCell>
                          {jobState === 'completed' && (
                            <TableCell className="text-sm text-muted-foreground">
                              {job.finishedOn
                                ? new Date(job.finishedOn).toLocaleString()
                                : '-'}
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            ANALYTICS TAB
        ═══════════════════════════════════════════════════════════════ */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <StatCard
                label="Processed Docs"
                value={ragStats?.totalProcessedDocuments}
                icon={FileText}
                color="text-green-400"
                bg="from-green-500/10 to-green-500/5 border-green-500/20"
                loading={ragLoading}
              />
              <StatCard
                label="Total Chunks"
                value={ragStats?.totalChunks}
                icon={Layers}
                color="text-indigo-400"
                bg="from-indigo-500/10 to-indigo-500/5 border-indigo-500/20"
                loading={ragLoading}
              />
              <StatCard
                label="Avg Chunks/Doc"
                value={ragStats?.avgChunksPerDocument}
                icon={BarChart3}
                color="text-primary"
                bg="from-primary/10 to-primary/5 border-primary/20"
                loading={ragLoading}
              />
            </div>

            {/* Latency metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(
                [
                  { label: 'Avg Retrieval', key: 'avgRetrievalMs', unit: 'ms' },
                  { label: 'Avg First Token', key: 'avgFirstTokenMs', unit: 'ms' },
                  { label: 'Avg Response', key: 'avgResponseMs', unit: 'ms' },
                ] as const
              ).map(({ label, key, unit }) => (
                <Card key={key} className="border-border">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-xs font-medium text-muted-foreground">
                      {label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    {ragLoading ? (
                      <div className="h-8 w-16 bg-muted animate-pulse rounded" />
                    ) : ragStats?.[key] != null ? (
                      <div className="text-2xl font-bold text-foreground">
                        {ragStats[key]}
                        <span className="text-sm font-normal text-muted-foreground ml-1">
                          {unit}
                        </span>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">Not instrumented</div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Daily document activity chart */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Document Processing Activity (Last 7 Days)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {ragLoading ? (
                  <div className="h-48 bg-muted animate-pulse rounded-lg" />
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={ragStats?.dailyDocumentActivity ?? []}
                      margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        tickFormatter={(v: string) =>
                          new Date(v).toLocaleDateString('en', { month: 'short', day: 'numeric' })
                        }
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'hsl(var(--popover))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          fontSize: 12,
                        }}
                        labelFormatter={(v: string) =>
                          new Date(v).toLocaleDateString('en', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          })
                        }
                        formatter={(v: number) => [v, 'Documents processed']}
                      />
                      <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* ── Delete user confirmation ─────────────────────────────────────── */}
      <AlertDialog
        open={!!deleteUserId}
        onOpenChange={(open) => !open && setDeleteUserId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this user?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the user and all their documents. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteUserId && deleteMutation.mutate(deleteUserId)}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  return (
    <Badge
      variant="outline"
      className={
        role === 'ADMIN'
          ? 'border-primary/40 text-primary bg-primary/10'
          : 'border-border text-muted-foreground'
      }
    >
      {role}
    </Badge>
  );
}

function UserRow({
  user,
  currentUserId,
  onDelete,
  onRoleChange,
  roleChangePending,
}: {
  user: AdminUser;
  currentUserId?: string;
  onDelete: () => void;
  onRoleChange: (role: 'USER' | 'ADMIN') => void;
  roleChangePending: boolean;
}) {
  const isSelf = user.id === currentUserId;

  return (
    <TableRow className="hover:bg-muted/30">
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold',
              user.role === 'ADMIN'
                ? 'bg-primary/20 text-primary'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {user.name.charAt(0).toUpperCase()}
          </div>
          <span className="text-sm">{user.name}</span>
          {isSelf && (
            <span className="text-[10px] text-muted-foreground">(you)</span>
          )}
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">{user.email}</TableCell>
      <TableCell>
        <RoleBadge role={user.role} />
      </TableCell>
      <TableCell className="text-muted-foreground text-sm text-center">
        {user._count?.documents ?? 0}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {new Date(user.createdAt).toLocaleDateString()}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {timeAgo(user.lastActiveAt)}
      </TableCell>
      <TableCell className="text-right">
        {!isSelf && (
          <div className="flex items-center justify-end gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 text-xs gap-1.5"
                  disabled={roleChangePending}
                >
                  Change role
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => onRoleChange('USER')}
                  disabled={user.role === 'USER'}
                >
                  Set as User
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onRoleChange('ADMIN')}
                  disabled={user.role === 'ADMIN'}
                >
                  Set as Admin
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {user.role !== 'ADMIN' && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                onClick={onDelete}
                aria-label={`Delete ${user.name}`}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Delete
              </Button>
            )}
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

function Pagination({
  page,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
}) {
  if (total <= pageSize) return null;
  const totalPages = Math.ceil(total / pageSize);
  return (
    <div className="flex items-center justify-between mt-4">
      <p className="text-sm text-muted-foreground">
        Page {page} of {totalPages}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page === 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
