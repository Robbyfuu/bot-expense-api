import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateExpenseDto {
  @IsInt()
  @Min(0)
  amount: number;

  @IsString()
  @IsNotEmpty()
  merchant: string;

  @IsString()
  @IsNotEmpty()
  category: string;

  @IsDateString()
  date: string;

  @IsUUID()
  @IsOptional()
  paymentForCardId?: string;

  @IsUUID()
  @IsOptional()
  paidWithCardId?: string;
}
