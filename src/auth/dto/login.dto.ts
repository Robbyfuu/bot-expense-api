import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  // Basic phone validation or just string as normalization handles it
  @Matches(/^\d+$/, { message: 'Phone number must contain only digits' })
  phoneNumber: string;
}
