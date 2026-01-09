/* eslint-disable */
import {
  Body,
  Controller,
  Post,
  Get,
  Patch,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    return this.authService.sendOtp(loginDto.phoneNumber);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(@Body() verifyDto: VerifyOtpDto) {
    return this.authService.verifyOtp(verifyDto.phoneNumber, verifyDto.code);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/generate')
  async generateTwoFactor(@Request() req) {
    return this.authService.generateTwoFactorSecret(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/enable')
  async enableTwoFactor(@Request() req, @Body('token') token: string) {
    return this.authService.enableTwoFactor(req.user.userId, token);
  }

  @Post('2fa/authenticate')
  @HttpCode(HttpStatus.OK)
  async authenticateTwoFactor(
    @Body('phoneNumber') phoneNumber: string,
    @Body('token') token: string,
  ) {
    return this.authService.validateTwoFactorLogin(phoneNumber, token);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refresh(refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Get('passkeys')
  async getPasskeys(@Request() req) {
    return this.authService.getPasskeys(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(@Request() req) {
    return this.authService.getProfile(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  async updateProfile(
    @Request() req,
    @Body('name') name?: string,
    @Body('color') color?: string,
    @Body('salary') salary?: number,
  ) {
    return this.authService.updateProfile(req.user.userId, {
      name,
      color,
      salary,
    });
  }
}
