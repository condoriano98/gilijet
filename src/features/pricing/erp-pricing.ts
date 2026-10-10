export const ERP_FEE_TIERS = [
  { upTo: 500, percent: 0.015, capIDR: 5000 },
  { upTo: 2000, percent: 0.012, capIDR: 4000 },
  { upTo: 5000, percent: 0.010, capIDR: 3000 },
  { upTo: Infinity, percent: 0.008, capIDR: 2500 },
] as const;

export function computeErpFee(args: {
  ticketCount: number;
  avgTicketIDR: number;
}): { totalFee: number; blendedRate: number } {
  const { ticketCount, avgTicketIDR } = args;
  if (ticketCount <= 0 || avgTicketIDR <= 0) return { totalFee: 0, blendedRate: 0 };

  let remaining = ticketCount;
  let prevBound = 0;
  let totalFee = 0;

  for (const tier of ERP_FEE_TIERS) {
    const tierTickets = Math.min(remaining, tier.upTo - prevBound);
    if (tierTickets <= 0) break;
    const feePerTicket = Math.min(
      Math.round(avgTicketIDR * tier.percent),
      tier.capIDR,
    );
    totalFee += tierTickets * feePerTicket;
    remaining -= tierTickets;
    prevBound = tier.upTo;
    if (remaining <= 0) break;
  }

  const grossRevenue = ticketCount * avgTicketIDR;
  const blendedRate = grossRevenue > 0 ? totalFee / grossRevenue : 0;
  return { totalFee, blendedRate };
}
