import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Search, UsersRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TableSkeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { parseApiError } from '@/lib/api';
import { usersApi } from '@/lib/auth-api';
import { formatDate } from '@/lib/format';
import { ROLE_LABEL } from '@/lib/navigation';
import type { Role } from '@/lib/types';

const PAGE_SIZE = 10;
const ALL = 'ALL';

/** First real admin feature: searchable, filterable, paginated list of users (GET /api/users). */
export default function AdminUsersPanel() {
  const [page, setPage] = useState(1);
  const [role, setRole] = useState<string>(ALL);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['users', { page, role, search }],
    queryFn: () =>
      usersApi.list({
        page,
        limit: PAGE_SIZE,
        role: role === ALL ? undefined : (role as Role),
        search: search || undefined,
      }),
    placeholderData: keepPreviousData,
  });

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Users</CardTitle>
        <p className="text-sm text-text-muted">
          Everyone registered in the system. Only administrators can see this list.
        </p>
      </CardHeader>
      <div className="space-y-4 p-5">
        <form
          onSubmit={onSearch}
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          role="search"
          aria-label="Search users"
        >
          <div className="flex-1">
            <Field label="Search">
              {(p) => (
                <Input
                  type="search"
                  placeholder="Name, email or CNIC"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  {...p}
                />
              )}
            </Field>
          </div>
          <div className="sm:w-52">
            <Field label="Role">
              {(p) => (
                <Select
                  value={role}
                  onValueChange={(v) => {
                    setPage(1);
                    setRole(v);
                  }}
                >
                  <SelectTrigger {...p}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All roles</SelectItem>
                    {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
          </div>
          <Button type="submit" variant="secondary">
            <Search aria-hidden="true" /> Search
          </Button>
        </form>

        {isError && <Alert variant="error">{parseApiError(error).message}</Alert>}

        {isPending ? (
          <TableSkeleton rows={6} cols={5} />
        ) : data && data.data.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            title="No users found"
            description="Try a different search or clear the role filter."
          />
        ) : (
          data && (
            <>
              <Table aria-label="Users">
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Registered</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">
                        {u.firstName} {u.lastName}
                      </TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>
                        <span className="block">{ROLE_LABEL[u.role]}</span>
                        {u.lawyerProfile && (
                          <Badge
                            className="mt-1"
                            variant={
                              u.lawyerProfile.verificationStatus === 'VERIFIED'
                                ? 'decided'
                                : u.lawyerProfile.verificationStatus === 'PENDING'
                                  ? 'pending'
                                  : 'rejected'
                            }
                          >
                            {u.lawyerProfile.verificationStatus === 'VERIFIED'
                              ? 'Verified'
                              : u.lawyerProfile.verificationStatus === 'PENDING'
                                ? 'Verification pending'
                                : 'Rejected'}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.status === 'ACTIVE' ? 'decided' : 'rejected'}>
                          {u.status === 'ACTIVE'
                            ? 'Active'
                            : u.status === 'SUSPENDED'
                              ? 'Suspended'
                              : 'Deactivated'}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(u.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination
                page={data.meta.page}
                totalPages={data.meta.totalPages}
                total={data.meta.total}
                onPageChange={setPage}
              />
            </>
          )
        )}
      </div>
    </Card>
  );
}
