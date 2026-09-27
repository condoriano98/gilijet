"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatIDR } from "@/lib/utils";
import type { PassengerDetail } from "@/lib/booking-display";

export type PassengerDetailsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  passengers: PassengerDetail[];
  totalAmount: number;
  nationality: string | null;
};

export function PassengerDetailsModal({
  open,
  onOpenChange,
  passengers,
  totalAmount,
  nationality,
}: PassengerDetailsModalProps) {
  const pricePerPassenger = totalAmount / passengers.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Passenger Details</DialogTitle>
          <DialogDescription>
            {passengers.length} passenger{passengers.length === 1 ? "" : "s"}
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Nationality</TableHead>
                <TableHead className="text-right">Price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {passengers.map((p, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800">
                      {p.type}
                    </span>
                  </TableCell>
                  <TableCell>{nationality || "-"}</TableCell>
                  <TableCell className="text-right">
                    {formatIDR(pricePerPassenger)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
