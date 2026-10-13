import { prisma } from '@/shared/server/db';
import { requireSuperAdmin } from '@/shared/server/auth';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { createSeason, toggleSeason, deleteSeason } from './actions';

export const metadata = { title: 'Seasons · Owner Console' };

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm';

const TYPE_BADGE = {
  LOW: 'outline',
  HIGH: 'warning',
  PEAK: 'destructive',
  OFF: 'secondary',
} as const;

// Season.startDate/endDate are @db.Date: the UTC date parts are the calendar day.
const day = (d: Date) => d.toISOString().slice(0, 10);

export default async function SeasonsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireSuperAdmin();
  const { error } = await searchParams;

  const seasons = await prisma.season.findMany({
    where: { deletedAt: null },
    orderBy: [{ startDate: 'asc' }, { endDate: 'asc' }],
  });

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div>
        <h2 className="text-lg font-semibold">Seasons</h2>
        <p className="text-sm text-muted-foreground">
          Calendar that picks the fare column (low / high / peak) for a departure date.
          Dates with no row use the normal price. OFF closes the day for booking.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add a date range</CardTitle>
          <CardDescription>
            Ranges may overlap. OFF beats PEAK, PEAK beats HIGH/LOW; otherwise the
            narrowest range wins. Dates are WITA calendar days and are per year
            (Nyepi moves), so add next year&apos;s ranges ahead of time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createSeason} className="grid gap-4 sm:grid-cols-5 sm:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor="type">Season</Label>
              <select id="type" name="type" defaultValue="HIGH" className={selectClass}>
                <option value="LOW">LOW</option>
                <option value="HIGH">HIGH</option>
                <option value="PEAK">PEAK</option>
                <option value="OFF">OFF (closed)</option>
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="startDate">From</Label>
              <Input id="startDate" name="startDate" type="date" required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="endDate">Until (inclusive)</Label>
              <Input id="endDate" name="endDate" type="date" required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="note">Note</Label>
              <Input id="note" name="note" maxLength={100} placeholder="Nyepi" />
            </div>
            <Button type="submit">Add</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All ranges</CardTitle>
          <CardDescription>
            Changes apply to new bookings only; existing bookings keep the price they were sold at.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {seasons.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No seasons yet — every date uses the normal price.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Season</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>Until</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {seasons.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Badge variant={TYPE_BADGE[s.type]}>{s.type}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{day(s.startDate)}</TableCell>
                    <TableCell className="font-mono text-sm">{day(s.endDate)}</TableCell>
                    <TableCell className="text-sm">{s.note ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={s.isActive ? 'success' : 'outline'}>
                        {s.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <form action={toggleSeason}>
                          <input type="hidden" name="id" value={s.id} />
                          <input type="hidden" name="next" value={s.isActive ? '0' : '1'} />
                          <Button type="submit" variant="outline" size="sm">
                            {s.isActive ? 'Deactivate' : 'Activate'}
                          </Button>
                        </form>
                        <form action={deleteSeason}>
                          <input type="hidden" name="id" value={s.id} />
                          <Button type="submit" variant="ghost" size="sm">
                            Delete
                          </Button>
                        </form>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
