'use client';

import { useState } from 'react';
import Link from 'next/link';
import { TableCell, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatIDR } from '@/lib/utils';
import { formatLocalDateTime } from '@/lib/datetime';
import {
  parsePassengersFromNotes,
  calculateArrivalTime,
} from '@/lib/booking-display';
import { PassengerDetailsModal } from './passenger-details-modal';
import { getMainLeg } from '@/lib/booking-helpers';
import type { Prisma } from '@prisma/client';

type BookingWithDetails = Prisma.BookingGetPayload<{
  include: {
    leg: { include: { schedule: { include: { boat: true } } } };
    outboundLeg: { include: { schedule: { include: { boat: true } } } };
    returnLeg: { include: { schedule: { include: { boat: true } } } };
    promotion: true;
    tickets: true;
    payment: true;
  };
}>;

export function BookingRow({ booking }: { booking: BookingWithDetails }) {
  const [modalOpen, setModalOpen] = useState(false);
  const mainLeg = getMainLeg(booking)!;
  const passengers = parsePassengersFromNotes(booking.notes);
  const arrivalTime = calculateArrivalTime(
    mainLeg.departureDate,
    mainLeg.schedule.durationMinutes,
  );

  return (
    <>
      <TableRow>
        <TableCell className="whitespace-nowrap font-mono text-xs">
          <Link
            href={`/b/${booking.bookingReference}`}
            className="hover:underline"
            target="_blank"
          >
            {booking.bookingReference}
          </Link>
        </TableCell>
        <TableCell className="whitespace-nowrap text-sm">
          <div>{mainLeg.schedule.originPort} - {formatLocalDateTime(mainLeg.departureDate)}</div>
          <div className="text-xs text-muted-foreground">{mainLeg.schedule.boat.name}</div>
        </TableCell>
        <TableCell className="whitespace-nowrap text-sm">
          <div>{mainLeg.schedule.destinationPort} - {formatLocalDateTime(arrivalTime)}</div>
          <div className="text-xs text-muted-foreground">Arrival</div>
        </TableCell>
        <TableCell className="max-w-[160px]">
          <div className="truncate text-sm" title={booking.customerName}>
            {booking.customerName}
          </div>
          <div
            className="truncate text-xs text-muted-foreground"
            title={booking.customerEmail}
          >
            {booking.customerEmail}
          </div>
        </TableCell>
        <TableCell className="whitespace-nowrap text-sm">
          {waNumber(booking.customerPhone) ? (
            <a
              href={`https://wa.me/${waNumber(booking.customerPhone)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-700 hover:underline"
            >
              {booking.customerPhone}
            </a>
          ) : (
            booking.customerPhone
          )}
        </TableCell>
        <TableCell className="whitespace-nowrap">
          {formatIDR(Number(booking.totalAmount))}
        </TableCell>
        <TableCell className="whitespace-nowrap text-sm">
          {booking.payment?.method ?? '-'}
        </TableCell>
        <TableCell className="whitespace-nowrap">
          {booking.payment?.amount ? formatIDR(Number(booking.payment.amount)) : '-'}
        </TableCell>
        <TableCell className="whitespace-nowrap">
          <Badge variant="outline" className="px-3 py-1">
            {booking.status.replace(/_/g, ' ')}
          </Badge>
        </TableCell>
        <TableCell className="whitespace-nowrap">
          <button
            onClick={() => setModalOpen(true)}
            className="cursor-pointer rounded px-2 py-1 font-semibold text-sky-700 hover:bg-sky-50"
          >
            {booking.tickets.length}
          </button>
        </TableCell>
        <TableCell className="whitespace-nowrap text-sm">
          {booking.customerNationality}
        </TableCell>
        <TableCell className="w-[320px] whitespace-pre-wrap break-words text-sm text-muted-foreground">
          {customerNotes(booking.notes)}
        </TableCell>
        <TableCell className="whitespace-nowrap font-mono text-xs">
          {booking.promotion?.code}
        </TableCell>
        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
          {formatLocalDateTime(booking.createdAt)}
        </TableCell>
      </TableRow>

      <PassengerDetailsModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        passengers={passengers}
        totalAmount={Number(booking.totalAmount)}
        nationality={booking.customerNationality}
      />
    </>
  );
}

function waNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return null;
  return digits.startsWith('0') ? `62${digits.slice(1)}` : digits;
}

function customerNotes(notes: string | null): string | null {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes) as { customerNotes?: string };
    return parsed.customerNotes || null;
  } catch {
    return notes;
  }
}
