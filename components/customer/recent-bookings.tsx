"use client";

import * as React from "react";
import { useEffect, useState } from "react";

type RecentBooking = {
  city: string;
  origin: string;
  destination: string;
};

const CITIES = [
  "Jakarta",
  "Surabaya",
  "Bandung",
  "Medan",
  "Semarang",
  "Makassar",
  "Denpasar",
  "Yogyakarta",
  "Palembang",
  "Malang",
  "Singapore",
  "Melbourne",
  "Sydney",
];

export function RecentBookings({ bookings }: { bookings: RecentBooking[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (bookings.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % bookings.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [bookings.length]);

  if (bookings.length === 0) return null;

  const booking = bookings[currentIndex];

  return (
    <div className="flex items-center justify-center gap-2 text-sm text-sky-100">
      <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
      <span>
        Someone from <span className="font-semibold text-white">{booking.city}</span> just booked{" "}
        <span className="font-semibold text-white">{booking.origin} → {booking.destination}</span>
      </span>
    </div>
  );
}

export function getRandomRecentBookings(count: number): RecentBooking[] {
  const routes = [
    { origin: "Sanur", destination: "Nusa Penida" },
    { origin: "Padang Bai", destination: "Gili Trawangan" },
    { origin: "Bangsal", destination: "Gili Trawangan" },
    { origin: "Sanur", destination: "Nusa Lembongan" },
    { origin: "Padang Bai", destination: "Lombok" },
    { origin: "Labuan Bajo", destination: "Komodo" },
  ];

  const result: RecentBooking[] = [];
  for (let i = 0; i < count; i++) {
    const route = routes[Math.floor(Math.random() * routes.length)];
    const city = CITIES[Math.floor(Math.random() * CITIES.length)];
    result.push({ city, origin: route.origin, destination: route.destination });
  }
  return result;
}
