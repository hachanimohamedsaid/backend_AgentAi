// Mock NestJS Swagger decorators for isolated DTO unit tests (installed in app runtime)
jest.mock('@nestjs/swagger', () => ({
  ApiProperty: () => (target: any, propertyKey?: string) => {},
  ApiPropertyOptional: () => (target: any, propertyKey?: string) => {},
}));

import { validate, ValidationError } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { MeetingDecisionDto, DecisionEnum } from './decision.dto';

/**
 * Unit Tests for MeetingDecisionDto
 * Validates all requirements are enforced
 */

describe('MeetingDecisionDto - Production Validation', () => {
  
  // ✅ Valid Request
  describe('Valid Payloads', () => {
    it('should accept a complete valid request', async () => {
      const payload = {
        meetingDate: '2026-02-15',
        meetingTime: '2026-02-15T14:30:00Z',
        decision: 'accept',
        durationMinutes: 30,
        requestId: '550e8400-e29b-41d4-a716-446655440000',
        userEmail: 'user@example.com',
        userTimezone: 'America/New_York',
      };

      const dto = plainToInstance(MeetingDecisionDto, payload);
      const errors: ValidationError[] = await validate(dto as any);
      
      expect(errors).toHaveLength(0);
    });

    it('should accept minimal valid request (no optional fields)', async () => {
      const payload = {
        meetingDate: '2026-02-15',
        meetingTime: '2026-02-15T14:30:00Z',
        decision: 'reject',
        durationMinutes: 1,
        requestId: '550e8400-e29b-41d4-a716-446655440000',
      };

      const dto = plainToInstance(MeetingDecisionDto, payload);
      const errors: ValidationError[] = await validate(dto as any);
      
      expect(errors).toHaveLength(0);
    });
  });

  // ❌ Invalid Dates
  describe('Date Validation (YYYY-MM-DD only)', () => {
    const basePayload = {
      meetingTime: '2026-02-15T14:30:00Z',
      decision: 'accept',
      durationMinutes: 30,
      requestId: '550e8400-e29b-41d4-a716-446655440000',
    };

    it('should reject wrong date format (MM/DD/YYYY)', async () => {
      const dto = plainToInstance(MeetingDecisionDto, {
        ...basePayload,
        meetingDate: '02/15/2026',
      });
      const errors: ValidationError[] = await validate(dto as any);
      
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.constraints?.['matches']).toBeDefined();
    });

    it('should reject date with time component', async () => {
      const dto = plainToInstance(MeetingDecisionDto, {
        ...basePayload,
        meetingDate: '2026-02-15T14:30:00Z',
      });
      const errors: ValidationError[] = await validate(dto as any);
      
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid date string', async () => {
      const dto = plainToInstance(MeetingDecisionDto, {
        ...basePayload,
        meetingDate: 'not-a-date',
      });
      const errors: ValidationError[] = await validate(dto as any);
      
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  // ❌ Invalid DateTime
  describe('DateTime Validation (Full ISO8601)', () => {
    const basePayload = {
      meetingDate: '2026-02-15',
      decision: 'accept',
      durationMinutes: 30,
      requestId: '550e8400-e29b-41d4-a716-446655440000',
    };

    it('should reject date-only format for meetingTime', async () => {
      const dto = plainToInstance(MeetingDecisionDto, {
        ...basePayload,
        meetingTime: '2026-02-15',
      });
      const errors: ValidationError[] = await validate(dto as any);
      
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept proper ISO8601 with Z', async () => {
      const dto = plainToInstance(MeetingDecisionDto, {
        ...basePayload,
        meetingTime: '2026-02-15T14:30:00Z',
      });
      const errors: ValidationError[] = await validate(dto as any);
      
      expect(errors).toHaveLength(0);
    });

    it('should accept ISO8601 with timezone offset', async () => {
      const dto = plainToInstance(MeetingDecisionDto, {
        ...basePayload,
        meetingTime: '2026-02-15T14:30:00-05:00',
      });
      const errors: ValidationError[] = await validate(dto as any);
      
      expect(errors).toHaveLength(0);
    });
  });

  // ❌ Invalid Decision
  describe('Decision Enum Validation', () => {
    const basePayload = {
      meetingDate: '2026-02-15',
      meetingTime: '2026-02-15T14:30:00Z',
      durationMinutes: 30,
      requestId: '550e8400-e29b-41d4-a716-446655440000',
    };

    it('should accept "accept"', async () => {
      const dto = plainToInstance(MeetingDecisionDto, {
        ...basePayload,
        decision: 'accept',
      });
      const errors: ValidationError[] = await validate(dto as any);
      
      expect(errors).toHaveLength(0);
    });

    it('should accept "reject"', async () => {
      const dto = plainToInstance(MeetingDecisionDto, {
        ...basePayload,
        decision: 'reject',
      });
      const errors: ValidationError[] = await validate(dto as any);
      
      expect(errors).toHaveLength(0);
    });

    it('should reject "accepted" (common typo)', async () => {
      const dto = plainToInstance(MeetingDecisionDto, {
        ...basePayload,
        decision: 'accepted',
      });
      const errors: ValidationError[] = await validate(dto as any);
      
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.constraints?.['isEnum']).toBeDefined();
    });

    it('should reject "rejected" (common typo)', async () => {
      const dto = plainToInstance(MeetingDecisionDto, {
        ...basePayload,
        decision: 'rejected',
      });
      const errors: ValidationError[] = await validate(dto as any);
      
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject "maybe"', async () => {
      const dto = plainToInstance(MeetingDecisionDto, {
        ...basePayload,
        decision: 'maybe',
      });
      const errors: ValidationError[] = await validate(dto as any);
      
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  // ❌ Invalid Duration
  describe('Duration Validation (Positive Integer)', () => {
    const basePayload = {
      meetingDate: '2026-02-15',
      meetingTime: '2026-02-15T14:30:00Z',
      decision: 'accept',
      requestId: '550e8400-e29b-41d4-a716-446655440000',
    };

    it('should accept positive integer', async () => {
      const dto = plainToInstance(MeetingDecisionDto, {
        ...basePayload,
        durationMinutes: 30,
      });
      const errors: ValidationError[] = await validate(dto as any);
      
      expect(errors).toHaveLength(0);
    });

    it('should reject zero', async () => {
      const dto = plainToInstance(MeetingDecisionDto, {
        ...basePayload,
        durationMinutes: 0,
      });
      const errors: ValidationError[] = await validate(dto as any);
      
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject negative', async () => {
      const dto = plainToInstance(MeetingDecisionDto, {
        ...basePayload,
        durationMinutes: -30,
      });
      const errors: ValidationError[] = await validate(dto as any);
      
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject float', async () => {
      const dto = plainToInstance(MeetingDecisionDto, {
        ...basePayload,
        durationMinutes: 30.5,
      });
      const errors: ValidationError[] = await validate(dto as any);
      
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.constraints?.['isInt']).toBeDefined();
    });

    it('should reject string number', async () => {
      const dto = plainToInstance(MeetingDecisionDto, {
        ...basePayload,
        durationMinutes: '30',
      });
      const errors: ValidationError[] = await validate(dto as any);
      
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  // ❌ Invalid UUID
  describe('RequestId UUID v4 Validation', () => {
    const basePayload = {
      meetingDate: '2026-02-15',
      meetingTime: '2026-02-15T14:30:00Z',
      decision: 'accept',
      durationMinutes: 30,
    };

    it('should accept valid UUID v4', async () => {
      const dto = plainToInstance(MeetingDecisionDto, {
        ...basePayload,
        requestId: '550e8400-e29b-41d4-a716-446655440000',
      });
      const errors: ValidationError[] = await validate(dto as any);
      
      expect(errors).toHaveLength(0);
    });

    it('should reject invalid UUID format', async () => {
      const dto = plainToInstance(MeetingDecisionDto, {
        ...basePayload,
        requestId: 'not-a-uuid',
      });
      const errors: ValidationError[] = await validate(dto as any);
      
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.constraints?.['isUuid']).toBeDefined();
    });

    it('should reject UUID without hyphens', async () => {
      const dto = plainToInstance(MeetingDecisionDto, {
        ...basePayload,
        requestId: '550e8400e29b41d4a716446655440000',
      });
      const errors: ValidationError[] = await validate(dto as any);
      
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject empty string', async () => {
      const dto = plainToInstance(MeetingDecisionDto, {
        ...basePayload,
        requestId: '',
      });
      const errors: ValidationError[] = await validate(dto as any);
      
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  // ❌ Invalid Optional Fields
  describe('Optional Field Validation', () => {
    const basePayload = {
      meetingDate: '2026-02-15',
      meetingTime: '2026-02-15T14:30:00Z',
      decision: 'accept',
      durationMinutes: 30,
      requestId: '550e8400-e29b-41d4-a716-446655440000',
    };

    it('should reject invalid email format', async () => {
      const dto = plainToInstance(MeetingDecisionDto, {
        ...basePayload,
        userEmail: 'not-an-email',
      });
      const errors: ValidationError[] = await validate(dto as any);
      
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.constraints?.['isEmail']).toBeDefined();
    });

    it('should accept valid email', async () => {
      const dto = plainToInstance(MeetingDecisionDto, {
        ...basePayload,
        userEmail: 'alice@example.com',
      });
      const errors: ValidationError[] = await validate(dto as any);
      
      expect(errors).toHaveLength(0);
    });

    it('should reject timezone exceeding 50 chars', async () => {
      const dto = plainToInstance(MeetingDecisionDto, {
        ...basePayload,
        userTimezone: 'a'.repeat(51),
      });
      const errors: ValidationError[] = await validate(dto as any);
      
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.constraints?.['maxLength']).toBeDefined();
    });

    it('should accept valid timezone', async () => {
      const dto = plainToInstance(MeetingDecisionDto, {
        ...basePayload,
        userTimezone: 'America/New_York',
      });
      const errors: ValidationError[] = await validate(dto as any);
      
      expect(errors).toHaveLength(0);
    });
  });

  // ✅ Idempotency
  describe('Idempotency Key (requestId)', () => {
    it('should allow duplicate requestId values (for idempotent requests)', async () => {
      // The DTO itself doesn't enforce uniqueness - the service layer does
      const payload1 = {
        meetingDate: '2026-02-15',
        meetingTime: '2026-02-15T14:30:00Z',
        decision: 'accept',
        durationMinutes: 30,
        requestId: '550e8400-e29b-41d4-a716-446655440000',
      };

      const payload2 = { ...payload1 }; // Same requestId

      const dto1 = plainToInstance(MeetingDecisionDto, payload1);
      const dto2 = plainToInstance(MeetingDecisionDto, payload2);

      const errors1: ValidationError[] = await validate(dto1 as any);
      const errors2: ValidationError[] = await validate(dto2 as any);

      expect(errors1).toHaveLength(0);
      expect(errors2).toHaveLength(0);
      // Service layer handles idempotency, not DTO
    });
  });
});
