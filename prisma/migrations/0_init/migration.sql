-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER', 'VA_BCA', 'VA_BNI', 'VA_BRI', 'VA_MANDIRI', 'VA_PERMATA', 'GOPAY', 'OVO', 'DANA', 'SHOPEEPAY', 'LINKAJA', 'QRIS', 'CREDIT_CARD', 'PAYPAL');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('MIDTRANS', 'PAYPAL', 'XENDIT', 'MAYAR', 'STRIPE', 'DOKU');

-- CreateEnum
CREATE TYPE "RefundReason" AS ENUM ('CUSTOMER_REQUEST', 'OPERATOR_CANCELLATION', 'WEATHER', 'ADMIN_OVERRIDE');

-- CreateEnum
CREATE TYPE "AuditEntityType" AS ENUM ('BOOKING', 'PAYMENT', 'REFUND', 'LEG', 'SCHEDULE', 'BOAT', 'OPERATOR', 'CUSTOMER', 'TICKET', 'PROMOTION', 'RESCHEDULE_REQUEST', 'PLATFORM_CONFIG');

-- CreateEnum
CREATE TYPE "AuditUserRole" AS ENUM ('CUSTOMER', 'OPERATOR', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "OperatorStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "BoatStatus" AS ENUM ('ACTIVE', 'MAINTENANCE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "LegStatus" AS ENUM ('OPEN', 'FULL', 'SAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING_PAYMENT', 'AWAITING_CONFIRMATION', 'CONFIRMED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_OPERATOR', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('ISSUED', 'CHECKED_IN', 'NO_SHOW', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESSFUL', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "WebhookEventStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "PromoCostBearer" AS ENUM ('PLATFORM', 'OPERATOR', 'SHARED');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'FLAT');

-- CreateEnum
CREATE TYPE "GatewayMode" AS ENUM ('ENV', 'SANDBOX', 'LIVE');

-- CreateEnum
CREATE TYPE "RescheduleStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BoatFacility" AS ENUM ('AIR_CONDITIONING', 'TOILET', 'WIFI', 'LIFE_JACKET', 'LIFE_RAFT', 'ENTERTAINMENT_SYSTEM', 'SNACK_SERVICE', 'DRINK_SERVICE', 'CHARGING_PORT', 'BLANKET', 'FIRST_AID_KIT', 'BAGGAGE_COMPARTMENT', 'OUTDOOR_DECK', 'CABIN_SEATING', 'SMOKING_AREA', 'PRAYER_ROOM');

-- CreateEnum
CREATE TYPE "OperatorService" AS ENUM ('BAGGAGE_INSURANCE', 'TRAVEL_INSURANCE', 'HOTEL_TRANSFER', 'MEAL_INCLUDED', 'PRIORITY_BOARDING', 'FLEXIBLE_RESCHEDULE', 'CHILD_DISCOUNT', 'GROUP_BOOKING', 'PET_FRIENDLY', 'WHEELCHAIR_ACCESSIBLE');

-- CreateEnum
CREATE TYPE "FareRefundability" AS ENUM ('REFUNDABLE', 'NON_REFUNDABLE', 'PARTIALLY_REFUNDABLE');

-- CreateEnum
CREATE TYPE "ScheduleType" AS ENUM ('DIRECT', 'TRANSIT');

-- CreateEnum
CREATE TYPE "FareType" AS ENUM ('REFUNDABLE', 'NON_REFUNDABLE');

-- CreateEnum
CREATE TYPE "OperatorStaffRole" AS ENUM ('MANAGER', 'GATE', 'BOOTH_AGENT', 'ACCOUNTANT', 'CAPTAIN', 'CREW', 'ENGINEER');

-- CreateEnum
CREATE TYPE "OperatorStaffStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "SeatHoldStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CONVERTED', 'RELEASED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'WHATSAPP', 'SMS');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('BOOKING_CONFIRMED', 'BOOKING_REMINDER_24H', 'BOOKING_REMINDER_2H', 'REFUND_APPROVED', 'REFUND_REJECTED', 'RESCHEDULE_APPROVED', 'RESCHEDULE_REJECTED', 'LEG_CANCELLED', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "OperatorDocumentType" AS ENUM ('VESSEL_LICENSE', 'SIUP', 'NPWP', 'INSURANCE_CERTIFICATE', 'CAPTAIN_LICENSE', 'OTHER');

-- CreateEnum
CREATE TYPE "OperatorDocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AgentTier" AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM');

-- CreateEnum
CREATE TYPE "LoyaltyTransactionType" AS ENUM ('EARNED', 'REDEEMED', 'EXPIRED', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "BookingAddonType" AS ENUM ('INSURANCE', 'HOTEL_TRANSFER', 'MEAL', 'BAGGAGE_EXTRA', 'PRIORITY_BOARDING', 'OTHER');

-- CreateEnum
CREATE TYPE "WeatherCondition" AS ENUM ('CALM', 'MODERATE', 'ROUGH', 'SEVERE', 'CLOSED');

-- CreateEnum
CREATE TYPE "CurrencyCode" AS ENUM ('IDR', 'USD', 'AUD', 'EUR', 'SGD');

-- CreateEnum
CREATE TYPE "SalesChannel" AS ENUM ('GILIFAST', 'GILIJET', 'WALK_IN', 'TRAVEL_AGENT', 'PHONE', 'EXTERNAL_AGGREGATOR');

-- CreateEnum
CREATE TYPE "EFakturStatus" AS ENUM ('NOT_REQUIRED', 'DRAFT', 'SUBMITTED', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('CERT_EXPIRY', 'CASH_VARIANCE', 'SYNC_FAILURE', 'PAYROLL_DRAFT_READY', 'SPT_DRAFT_READY', 'AGENT_PAYOUT_DUE', 'PERIOD_CLOSE_PROMPT', 'CORETAX_REJECTION', 'BPJS_REJECTION');

-- CreateEnum
CREATE TYPE "NotificationSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "LoginKind" AS ENUM ('OPERATOR', 'ADMIN', 'CUSTOMER');

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "googleId" TEXT,
    "fullName" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "nationality" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Operator" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactPerson" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "bankAccountInfo" JSONB NOT NULL,
    "npwp" TEXT,
    "status" "OperatorStatus" NOT NULL DEFAULT 'PENDING',
    "documentsVerified" BOOLEAN NOT NULL DEFAULT false,
    "commissionRate" DECIMAL(5,4) NOT NULL DEFAULT 0.08,
    "agentId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Operator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'STAFF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Boat" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Public',
    "photos" TEXT[],
    "description" TEXT,
    "status" "BoatStatus" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Boat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL,
    "boatId" TEXT NOT NULL,
    "originPort" TEXT NOT NULL,
    "destinationPort" TEXT NOT NULL,
    "originPortId" TEXT,
    "destinationPortId" TEXT,
    "departureTime" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "basePrice" DECIMAL(12,2) NOT NULL,
    "daysOfWeek" INTEGER[],
    "status" "ScheduleStatus" NOT NULL DEFAULT 'ACTIVE',
    "fareMatrix" JSONB,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Leg" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "departureDate" TIMESTAMP(3) NOT NULL,
    "basePrice" DECIMAL(12,2) NOT NULL,
    "status" "LegStatus" NOT NULL DEFAULT 'OPEN',
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Leg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "bookingReference" TEXT NOT NULL,
    "legId" TEXT NOT NULL,
    "customerId" TEXT,
    "operatorId" TEXT NOT NULL,
    "agentId" TEXT,
    "salesChannel" "SalesChannel" NOT NULL DEFAULT 'GILIFAST',
    "salesStaffId" TEXT,
    "salesAgentId" TEXT,
    "agentCommissionAmount" DECIMAL(14,2),
    "agentCommissionPercent" DECIMAL(5,4),
    "pph23WithholdingAmount" DECIMAL(14,2),
    "cashCollected" DECIMAL(14,2),
    "externalAggregatorName" TEXT,
    "externalAggregatorRef" TEXT,
    "eFakturNumber" TEXT,
    "eFakturStatus" "EFakturStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerNationality" TEXT,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "commissionAmount" DECIMAL(12,2) NOT NULL,
    "operatorAmount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "refundDeadline" TIMESTAMP(3) NOT NULL,
    "refundPolicySnapshot" JSONB,
    "paymentGatewayRef" TEXT,
    "idempotencyKey" TEXT,
    "notes" TEXT,
    "promotionId" TEXT,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "reminderSentAt" TIMESTAMP(3),
    "availabilityDecidedAt" TIMESTAMP(3),
    "availabilityDecidedById" TEXT,
    "availabilityNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "ticketCode" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "passengerName" TEXT NOT NULL,
    "passengerIdNumber" TEXT,
    "qrHash" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'ISSUED',
    "checkedInAt" TIMESTAMP(3),
    "checkedInById" TEXT,
    "checkedInBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "gatewayProvider" "PaymentProvider" NOT NULL DEFAULT 'MIDTRANS',
    "gatewayReference" TEXT,
    "gatewayFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),
    "failedReason" TEXT,
    "rawWebhookData" JSONB,
    "instrumentData" JSONB,
    "expiresAt" TIMESTAMP(3),
    "presentmentCurrency" VARCHAR(3),
    "presentmentAmount" DECIMAL(12,2),
    "fxRate" DECIMAL(18,6),
    "fxQuotedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "originalAmount" DECIMAL(12,2) NOT NULL,
    "refundAmount" DECIMAL(12,2) NOT NULL,
    "reason" "RefundReason" NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "gatewayReference" TEXT,
    "processedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "externalRef" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "status" "WebhookEventStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "discountType" "DiscountType" NOT NULL,
    "discountValue" DECIMAL(12,2) NOT NULL,
    "minAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "description" TEXT,
    "perCustomerLimit" INTEGER,
    "firstBookingOnly" BOOLEAN NOT NULL DEFAULT false,
    "maxDiscountAmount" DECIMAL(12,2),
    "stackable" BOOLEAN NOT NULL DEFAULT false,
    "costBearer" "PromoCostBearer" NOT NULL DEFAULT 'SHARED',
    "appliesToRouteCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "appliesToOperatorIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "budgetCap" DECIMAL(12,2),
    "budgetSpent" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionRedemption" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromotionRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "commissionRate" DECIMAL(5,4) NOT NULL DEFAULT 0.08,
    "dokuMode" "GatewayMode" NOT NULL DEFAULT 'ENV',
    "paypalMode" "GatewayMode" NOT NULL DEFAULT 'ENV',
    "serviceFeeType" "DiscountType",
    "serviceFeeValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "adultMultiplier" DECIMAL(5,4) NOT NULL DEFAULT 1,
    "childMultiplier" DECIMAL(5,4) NOT NULL DEFAULT 0.5,
    "infantMultiplier" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "adminWhatsappNumber" TEXT,
    "adminAlertTemplate" TEXT,
    "alertOnNewBooking" BOOLEAN NOT NULL DEFAULT true,
    "alertOnBookingPaid" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "text" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RescheduleRequest" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "originalLegId" TEXT NOT NULL,
    "requestedLegId" TEXT NOT NULL,
    "status" "RescheduleStatus" NOT NULL DEFAULT 'PENDING',
    "customerNote" TEXT,
    "adminNote" TEXT,
    "processedBy" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RescheduleRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoatFacilitiesOnBoat" (
    "boatId" TEXT NOT NULL,
    "facility" "BoatFacility" NOT NULL,

    CONSTRAINT "BoatFacilitiesOnBoat_pkey" PRIMARY KEY ("boatId","facility")
);

-- CreateTable
CREATE TABLE "OperatorServicesOnOperator" (
    "operatorId" TEXT NOT NULL,
    "service" "OperatorService" NOT NULL,

    CONSTRAINT "OperatorServicesOnOperator_pkey" PRIMARY KEY ("operatorId","service")
);

-- CreateTable
CREATE TABLE "TransitStop" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "portName" TEXT NOT NULL,
    "arrivalTime" TEXT NOT NULL,
    "departureTime" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,

    CONSTRAINT "TransitStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Port" (
    "id" TEXT NOT NULL,
    "shortCode" VARCHAR(3) NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "island" TEXT,
    "province" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Makassar',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Port_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorStaff" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "OperatorStaffRole" NOT NULL DEFAULT 'GATE',
    "status" "OperatorStaffStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperatorStaff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeatHold" (
    "id" TEXT NOT NULL,
    "legId" TEXT NOT NULL,
    "sessionKey" TEXT NOT NULL,
    "seats" INTEGER NOT NULL,
    "status" "SeatHoldStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "bookingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeatHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "type" "NotificationType" NOT NULL,
    "recipient" TEXT NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "providerRef" TEXT,
    "payloadSummary" JSONB,
    "sentAt" TIMESTAMP(3),
    "failedReason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorDocument" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "type" "OperatorDocumentType" NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT,
    "status" "OperatorDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "rejectionNote" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperatorDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactPerson" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "tier" "AgentTier" NOT NULL DEFAULT 'BRONZE',
    "commissionRate" DECIMAL(5,4) NOT NULL DEFAULT 0.05,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "totalBookings" INTEGER NOT NULL DEFAULT 0,
    "totalRevenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "apiKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyAccount" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "pointsBalance" INTEGER NOT NULL DEFAULT 0,
    "lifetimePoints" INTEGER NOT NULL DEFAULT 0,
    "tier" "AgentTier" NOT NULL DEFAULT 'BRONZE',
    "tierExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyTransaction" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "bookingId" TEXT,
    "type" "LoyaltyTransactionType" NOT NULL,
    "points" INTEGER NOT NULL,
    "description" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoatPosition" (
    "id" TEXT NOT NULL,
    "boatId" TEXT NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "speedKnots" DECIMAL(5,1),
    "heading" INTEGER,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoatPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingAddon" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "type" "BookingAddonType" NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "totalPrice" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingAddon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeatherSnapshot" (
    "id" TEXT NOT NULL,
    "legId" TEXT NOT NULL,
    "condition" "WeatherCondition" NOT NULL,
    "waveHeight" DECIMAL(4,2),
    "windSpeedKnots" DECIMAL(5,1),
    "temperature" DECIMAL(4,1),
    "source" TEXT NOT NULL DEFAULT 'BMKG',
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeatherSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FxRate" (
    "id" TEXT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "rate" DECIMAL(12,6) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FxRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeatherForecast" (
    "id" TEXT NOT NULL,
    "portName" TEXT NOT NULL,
    "forecastFor" TIMESTAMP(3) NOT NULL,
    "waveHeightM" DECIMAL(4,2),
    "windKnots" DECIMAL(5,1),
    "condition" "WeatherCondition" NOT NULL DEFAULT 'CALM',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeatherForecast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelAgent" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT,
    "phoneNumber" TEXT,
    "email" TEXT,
    "npwp" TEXT,
    "address" TEXT,
    "defaultCommissionPercent" DECIMAL(5,4) NOT NULL,
    "bankName" TEXT,
    "bankAccountNumber" TEXT,
    "bankAccountName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorPicContact" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT,
    "nohpNotifikasi" TEXT,
    "emailNotifikasi" TEXT,
    "nohpKonfirmasiTrigger" TEXT,
    "emailKonfirmasiTrigger" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperatorPicContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashDrawerSession" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "openingBalance" DECIMAL(14,2) NOT NULL,
    "expectedCash" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "closingBalanceCounted" DECIMAL(14,2),
    "variance" DECIMAL(14,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashDrawerSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorNotification" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "severity" "NotificationSeverity" NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "actionUrl" TEXT,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatorNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "entityType" "AuditEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "userId" TEXT,
    "userRole" "AuditUserRole",
    "previousState" JSONB,
    "newState" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "kind" "LoginKind" NOT NULL,
    "emailKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_googleId_key" ON "Customer"("googleId");

-- CreateIndex
CREATE INDEX "Customer_email_idx" ON "Customer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Operator_email_key" ON "Operator"("email");

-- CreateIndex
CREATE INDEX "Operator_status_idx" ON "Operator"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Boat_registrationNumber_key" ON "Boat"("registrationNumber");

-- CreateIndex
CREATE INDEX "Boat_operatorId_idx" ON "Boat"("operatorId");

-- CreateIndex
CREATE INDEX "Schedule_boatId_status_idx" ON "Schedule"("boatId", "status");

-- CreateIndex
CREATE INDEX "Schedule_originPort_destinationPort_idx" ON "Schedule"("originPort", "destinationPort");

-- CreateIndex
CREATE UNIQUE INDEX "Schedule_boatId_originPort_destinationPort_departureTime_key" ON "Schedule"("boatId", "originPort", "destinationPort", "departureTime");

-- CreateIndex
CREATE INDEX "Leg_departureDate_status_idx" ON "Leg"("departureDate", "status");

-- CreateIndex
CREATE INDEX "Leg_operatorId_departureDate_idx" ON "Leg"("operatorId", "departureDate");

-- CreateIndex
CREATE UNIQUE INDEX "Leg_scheduleId_departureDate_key" ON "Leg"("scheduleId", "departureDate");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_bookingReference_key" ON "Booking"("bookingReference");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_idempotencyKey_key" ON "Booking"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Booking_legId_idx" ON "Booking"("legId");

-- CreateIndex
CREATE INDEX "Booking_status_idx" ON "Booking"("status");

-- CreateIndex
CREATE INDEX "Booking_customerEmail_idx" ON "Booking"("customerEmail");

-- CreateIndex
CREATE INDEX "Booking_customerId_idx" ON "Booking"("customerId");

-- CreateIndex
CREATE INDEX "Booking_promotionId_idx" ON "Booking"("promotionId");

-- CreateIndex
CREATE INDEX "Booking_operatorId_status_idx" ON "Booking"("operatorId", "status");

-- CreateIndex
CREATE INDEX "Booking_operatorId_createdAt_idx" ON "Booking"("operatorId", "createdAt");

-- CreateIndex
CREATE INDEX "Booking_operatorId_salesChannel_createdAt_idx" ON "Booking"("operatorId", "salesChannel", "createdAt");

-- CreateIndex
CREATE INDEX "Booking_salesAgentId_idx" ON "Booking"("salesAgentId");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_ticketCode_key" ON "Ticket"("ticketCode");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_qrHash_key" ON "Ticket"("qrHash");

-- CreateIndex
CREATE INDEX "Ticket_bookingId_idx" ON "Ticket"("bookingId");

-- CreateIndex
CREATE INDEX "Ticket_qrHash_idx" ON "Ticket"("qrHash");

-- CreateIndex
CREATE INDEX "Ticket_checkedInById_idx" ON "Ticket"("checkedInById");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_bookingId_key" ON "Payment"("bookingId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_gatewayReference_idx" ON "Payment"("gatewayReference");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_bookingId_key" ON "Refund"("bookingId");

-- CreateIndex
CREATE INDEX "Refund_status_idx" ON "Refund"("status");

-- CreateIndex
CREATE INDEX "WebhookEvent_status_createdAt_idx" ON "WebhookEvent"("status", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_provider_externalRef_idx" ON "WebhookEvent"("provider", "externalRef");

-- CreateIndex
CREATE UNIQUE INDEX "Promotion_code_key" ON "Promotion"("code");

-- CreateIndex
CREATE INDEX "Promotion_code_isActive_idx" ON "Promotion"("code", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionRedemption_bookingId_key" ON "PromotionRedemption"("bookingId");

-- CreateIndex
CREATE INDEX "PromotionRedemption_promotionId_idx" ON "PromotionRedemption"("promotionId");

-- CreateIndex
CREATE INDEX "PromotionRedemption_customerEmail_idx" ON "PromotionRedemption"("customerEmail");

-- CreateIndex
CREATE UNIQUE INDEX "Review_bookingId_key" ON "Review"("bookingId");

-- CreateIndex
CREATE INDEX "Review_scheduleId_idx" ON "Review"("scheduleId");

-- CreateIndex
CREATE INDEX "Review_customerId_idx" ON "Review"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "RescheduleRequest_bookingId_key" ON "RescheduleRequest"("bookingId");

-- CreateIndex
CREATE INDEX "RescheduleRequest_status_idx" ON "RescheduleRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_email_idx" ON "PasswordResetToken"("email");

-- CreateIndex
CREATE INDEX "TransitStop_scheduleId_orderIndex_idx" ON "TransitStop"("scheduleId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Port_shortCode_key" ON "Port"("shortCode");

-- CreateIndex
CREATE UNIQUE INDEX "Port_slug_key" ON "Port"("slug");

-- CreateIndex
CREATE INDEX "Port_shortCode_idx" ON "Port"("shortCode");

-- CreateIndex
CREATE INDEX "Port_isActive_idx" ON "Port"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorStaff_email_key" ON "OperatorStaff"("email");

-- CreateIndex
CREATE INDEX "OperatorStaff_operatorId_status_idx" ON "OperatorStaff"("operatorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SeatHold_bookingId_key" ON "SeatHold"("bookingId");

-- CreateIndex
CREATE INDEX "SeatHold_legId_status_expiresAt_idx" ON "SeatHold"("legId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "SeatHold_sessionKey_idx" ON "SeatHold"("sessionKey");

-- CreateIndex
CREATE INDEX "NotificationLog_referenceType_referenceId_idx" ON "NotificationLog"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "NotificationLog_status_createdAt_idx" ON "NotificationLog"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OperatorDocument_status_idx" ON "OperatorDocument"("status");

-- CreateIndex
CREATE INDEX "OperatorDocument_expiresAt_idx" ON "OperatorDocument"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorDocument_operatorId_type_key" ON "OperatorDocument"("operatorId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_email_key" ON "Agent"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_apiKey_key" ON "Agent"("apiKey");

-- CreateIndex
CREATE INDEX "Agent_email_idx" ON "Agent"("email");

-- CreateIndex
CREATE INDEX "Agent_isActive_idx" ON "Agent"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyAccount_customerId_key" ON "LoyaltyAccount"("customerId");

-- CreateIndex
CREATE INDEX "LoyaltyAccount_customerId_idx" ON "LoyaltyAccount"("customerId");

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_accountId_createdAt_idx" ON "LoyaltyTransaction"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_bookingId_idx" ON "LoyaltyTransaction"("bookingId");

-- CreateIndex
CREATE INDEX "BoatPosition_boatId_recordedAt_idx" ON "BoatPosition"("boatId", "recordedAt");

-- CreateIndex
CREATE INDEX "BookingAddon_bookingId_idx" ON "BookingAddon"("bookingId");

-- CreateIndex
CREATE INDEX "WeatherSnapshot_legId_idx" ON "WeatherSnapshot"("legId");

-- CreateIndex
CREATE UNIQUE INDEX "WeatherSnapshot_legId_recordedAt_key" ON "WeatherSnapshot"("legId", "recordedAt");

-- CreateIndex
CREATE INDEX "FxRate_currency_fetchedAt_idx" ON "FxRate"("currency", "fetchedAt");

-- CreateIndex
CREATE INDEX "WeatherForecast_portName_forecastFor_idx" ON "WeatherForecast"("portName", "forecastFor");

-- CreateIndex
CREATE INDEX "TravelAgent_operatorId_isActive_deletedAt_idx" ON "TravelAgent"("operatorId", "isActive", "deletedAt");

-- CreateIndex
CREATE INDEX "OperatorPicContact_operatorId_idx" ON "OperatorPicContact"("operatorId");

-- CreateIndex
CREATE INDEX "CashDrawerSession_operatorId_openedAt_idx" ON "CashDrawerSession"("operatorId", "openedAt");

-- CreateIndex
CREATE INDEX "CashDrawerSession_staffId_closedAt_idx" ON "CashDrawerSession"("staffId", "closedAt");

-- CreateIndex
CREATE INDEX "OperatorNotification_operatorId_readAt_createdAt_idx" ON "OperatorNotification"("operatorId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_kind_emailKey_createdAt_idx" ON "LoginAttempt"("kind", "emailKey", "createdAt");

-- AddForeignKey
ALTER TABLE "Operator" ADD CONSTRAINT "Operator_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Boat" ADD CONSTRAINT "Boat_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_boatId_fkey" FOREIGN KEY ("boatId") REFERENCES "Boat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_originPortId_fkey" FOREIGN KEY ("originPortId") REFERENCES "Port"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_destinationPortId_fkey" FOREIGN KEY ("destinationPortId") REFERENCES "Port"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Leg" ADD CONSTRAINT "Leg_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Leg" ADD CONSTRAINT "Leg_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_legId_fkey" FOREIGN KEY ("legId") REFERENCES "Leg"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_salesStaffId_fkey" FOREIGN KEY ("salesStaffId") REFERENCES "OperatorStaff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_salesAgentId_fkey" FOREIGN KEY ("salesAgentId") REFERENCES "TravelAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_checkedInById_fkey" FOREIGN KEY ("checkedInById") REFERENCES "OperatorStaff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRedemption" ADD CONSTRAINT "PromotionRedemption_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRedemption" ADD CONSTRAINT "PromotionRedemption_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RescheduleRequest" ADD CONSTRAINT "RescheduleRequest_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RescheduleRequest" ADD CONSTRAINT "RescheduleRequest_originalLegId_fkey" FOREIGN KEY ("originalLegId") REFERENCES "Leg"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RescheduleRequest" ADD CONSTRAINT "RescheduleRequest_requestedLegId_fkey" FOREIGN KEY ("requestedLegId") REFERENCES "Leg"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoatFacilitiesOnBoat" ADD CONSTRAINT "BoatFacilitiesOnBoat_boatId_fkey" FOREIGN KEY ("boatId") REFERENCES "Boat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorServicesOnOperator" ADD CONSTRAINT "OperatorServicesOnOperator_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransitStop" ADD CONSTRAINT "TransitStop_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorStaff" ADD CONSTRAINT "OperatorStaff_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatHold" ADD CONSTRAINT "SeatHold_legId_fkey" FOREIGN KEY ("legId") REFERENCES "Leg"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatHold" ADD CONSTRAINT "SeatHold_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorDocument" ADD CONSTRAINT "OperatorDocument_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyAccount" ADD CONSTRAINT "LoyaltyAccount_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LoyaltyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoatPosition" ADD CONSTRAINT "BoatPosition_boatId_fkey" FOREIGN KEY ("boatId") REFERENCES "Boat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingAddon" ADD CONSTRAINT "BookingAddon_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeatherSnapshot" ADD CONSTRAINT "WeatherSnapshot_legId_fkey" FOREIGN KEY ("legId") REFERENCES "Leg"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelAgent" ADD CONSTRAINT "TravelAgent_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorPicContact" ADD CONSTRAINT "OperatorPicContact_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashDrawerSession" ADD CONSTRAINT "CashDrawerSession_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashDrawerSession" ADD CONSTRAINT "CashDrawerSession_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "OperatorStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorNotification" ADD CONSTRAINT "OperatorNotification_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row level security (not modelled by Prisma): enabled on this table in the
-- existing databases, with no policy, so only the DB role can read or write it.
ALTER TABLE "OperatorPicContact" ENABLE ROW LEVEL SECURITY;
