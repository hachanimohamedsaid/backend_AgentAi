import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type DispatchBody = {
  proposalId?: string;
  bookingId?: string;
  userId?: string;
  provider?: string;
  from?: string;
  to?: string;
  pickupAt?: string;
};

type DecisionBody = {
  proposalId?: string;
  bookingId?: string;
  providerBookingRef?: string;
  action?: 'accept' | 'reject';
};

@Controller('mobility/provider-simulator')
export class MobilityProviderSimulatorController {
  private readonly rides = new Map<
    string,
    {
      providerBookingRef: string;
      tripStatus: string;
      driver: {
        first_name: string;
        last_name: string;
        phone_number: string;
        eta_minutes: number;
        location: { lat: number; lng: number };
      };
      vehicle: {
        license_plate: string;
        car_model: string;
      };
    }
  >();

  constructor(private readonly configService: ConfigService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  dispatch(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: DispatchBody,
  ) {
    this.assertProviderToken(authorization);

    const proposalId = body.proposalId ?? 'unknown-proposal';
    const seed = this.seedFrom(proposalId);
    const providerBookingRef = `uber_ride_${seed}`;

    const latBase = 25.2 + (seed % 70) * 0.0007;
    const lngBase = 55.26 + (seed % 70) * 0.0006;

    const driverProfile = {
      first_name: 'Ahmed',
      last_name: `Ben ${String.fromCharCode(65 + (seed % 26))}`,
      phone_number: `+21690${String(seed % 1000000).padStart(6, '0')}`,
      eta_minutes: 4 + (seed % 6),
      location: {
        lat: Number(latBase.toFixed(6)),
        lng: Number(lngBase.toFixed(6)),
      },
    };

    const vehicle = {
      license_plate: `${200 + (seed % 600)} TUN ${1000 + (seed % 8000)}`,
      car_model: ['Toyota Corolla', 'Hyundai i20', 'Kia Rio'][seed % 3],
    };

    this.rides.set(proposalId, {
      providerBookingRef,
      tripStatus: 'AWAITING_USER_DECISION',
      driver: driverProfile,
      vehicle,
    });

    return {
      status: 'DRIVER_ACCEPTED',
      providerBookingRef,
      trip_status: 'AWAITING_USER_DECISION',
      driver: driverProfile,
      vehicle,
      meta: {
        provider: body.provider ?? 'uberx',
        proposalId,
        bookingId: body.bookingId ?? null,
        pickupAt: body.pickupAt ?? null,
      },
    };
  }

  @Post('driver/accept')
  @HttpCode(HttpStatus.OK)
  acceptDriver(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: DecisionBody,
  ) {
    this.assertProviderToken(authorization);
    const proposalId = body.proposalId ?? 'unknown-proposal';
    const existing = this.rides.get(proposalId);

    if (existing) {
      existing.tripStatus = 'DRIVER_ARRIVING';
      existing.driver.eta_minutes = Math.max(
        1,
        existing.driver.eta_minutes - 2,
      );
      this.rides.set(proposalId, existing);
      return {
        ok: true,
        status: 'ACCEPTED',
        trip_status: existing.tripStatus,
        providerBookingRef: existing.providerBookingRef,
      };
    }

    return {
      ok: true,
      status: 'ACCEPTED',
      trip_status: 'DRIVER_ARRIVING',
      providerBookingRef: body.providerBookingRef ?? null,
    };
  }

  @Post('driver/reject')
  @HttpCode(HttpStatus.OK)
  rejectDriver(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: DecisionBody,
  ) {
    this.assertProviderToken(authorization);
    const proposalId = body.proposalId ?? 'unknown-proposal';
    const existing = this.rides.get(proposalId);
    if (existing) {
      existing.tripStatus = 'CANCELED_BY_USER';
      this.rides.set(proposalId, existing);
    }

    return {
      ok: true,
      status: 'REJECTED',
      trip_status: 'CANCELED_BY_USER',
      providerBookingRef:
        existing?.providerBookingRef ?? body.providerBookingRef ?? null,
    };
  }

  private assertProviderToken(authorization: string | undefined) {
    const expected = this.configService.get<string>('PROVIDER_API_KEY');
    if (!expected) {
      return;
    }

    const token = authorization?.replace(/^Bearer\s+/i, '').trim();
    if (token !== expected) {
      throw new UnauthorizedException({
        code: 'FORBIDDEN',
        message: 'Invalid provider API key',
      });
    }
  }

  private seedFrom(value: string) {
    let h = 0;
    for (let i = 0; i < value.length; i += 1) {
      h = (h * 31 + value.charCodeAt(i)) >>> 0;
    }
    return h % 1000000;
  }
}
