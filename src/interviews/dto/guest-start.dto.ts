import { IsOptional, IsString, IsUUID } from 'class-validator';

export class GuestStartDto {
  /**
   * Si fourni, tente de reprendre la session existante.
   * 403 si le sessionId appartient à un autre token invité.
   */
  @IsOptional()
  @IsUUID()
  sessionId?: string;
}
