import { IsNotEmpty, IsString, IsObject, IsOptional } from 'class-validator';

export class WebAuthnVerifyDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  rawId: string;

  @IsObject()
  response: any; // Complex object, can use specific type or leave as object for now if complex

  @IsString()
  @IsOptional()
  type?: string;

  @IsOptional()
  clientExtensionResults?: any;
}

export class WebAuthnLoginVerifyDto {
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  rawId: string;

  @IsObject()
  response: any;

  @IsString()
  @IsOptional()
  type?: string;

  @IsOptional()
  clientExtensionResults?: any;
}
