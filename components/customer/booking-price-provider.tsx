"use client";

import * as React from "react";
import type { PassengerType } from "@/lib/pricing";

type BookingPriceContextValue = {
  types: PassengerType[];
  setType: (index: number, type: PassengerType) => void;
  addPassenger: () => void;
  removePassenger: () => void;
  unitPriceFor: (type: PassengerType) => number;
  total: number;
  max: number;
};

const BookingPriceContext = React.createContext<BookingPriceContextValue | null>(null);

/** Live passenger count/type + per-category unit prices, shared by the
 * passenger rows, price summary, promo preview and submit button so they
 * never disagree with each other. */
export function useBookingPrice() {
  const ctx = React.useContext(BookingPriceContext);
  if (!ctx) {
    throw new Error("useBookingPrice must be used within BookingPriceProvider");
  }
  return ctx;
}

export function BookingPriceProvider({
  adultPrice,
  childPrice,
  infantPrice,
  initialCount,
  max = 10,
  children,
}: {
  adultPrice: number;
  childPrice: number;
  infantPrice: number;
  initialCount: number;
  max?: number;
  children: React.ReactNode;
}) {
  const [types, setTypes] = React.useState<PassengerType[]>(() =>
    Array.from(
      { length: Math.max(1, Math.min(max, initialCount)) },
      () => "ADULT" as PassengerType,
    ),
  );

  const unitPriceFor = React.useCallback(
    (type: PassengerType) => {
      if (type === "ADULT") return adultPrice;
      if (type === "CHILD") return childPrice;
      return infantPrice;
    },
    [adultPrice, childPrice, infantPrice],
  );

  const setType = React.useCallback((index: number, type: PassengerType) => {
    setTypes((prev) => prev.map((t, i) => (i === index ? type : t)));
  }, []);

  const addPassenger = React.useCallback(() => {
    setTypes((prev) => (prev.length >= max ? prev : [...prev, "ADULT"]));
  }, [max]);

  const removePassenger = React.useCallback(() => {
    setTypes((prev) => (prev.length <= 1 ? prev : prev.slice(0, -1)));
  }, []);

  const total = types.reduce((sum, t) => sum + unitPriceFor(t), 0);

  return (
    <BookingPriceContext.Provider
      value={{ types, setType, addPassenger, removePassenger, unitPriceFor, total, max }}
    >
      {children}
    </BookingPriceContext.Provider>
  );
}
