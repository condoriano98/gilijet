import { PaymentMethod } from '@prisma/client';

// Bank-transfer family treated as cash-equivalent for the drawer: physical
// settlement confirmed at the counter. Adjust here if a real CASH method is
// added to the PaymentMethod enum later.
export const CASH_DRAWER_METHODS: PaymentMethod[] = [
  PaymentMethod.BANK_TRANSFER,
  PaymentMethod.VA_BCA,
  PaymentMethod.VA_BNI,
  PaymentMethod.VA_BRI,
  PaymentMethod.VA_MANDIRI,
  PaymentMethod.VA_PERMATA,
];
