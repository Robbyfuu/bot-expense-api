export interface JwtPayload {
  sub: string;
  phoneNumber: string;
  iat?: number;
  exp?: number;
}
