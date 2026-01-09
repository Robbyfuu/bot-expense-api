import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class UpdateExpenseDto {
  @IsInt()
  @Min(0)
  @IsOptional()
  amount?: number;

  @IsString()
  @IsOptional()
  category?: string;

  @IsUUID()
  @IsOptional()
  paidWithCardId?: string;
}
