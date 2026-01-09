/* eslint-disable */
import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { WebAuthnService } from './webauthn.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import {
  WebAuthnVerifyDto,
  WebAuthnLoginVerifyDto,
} from './dto/webauthn-verify.dto';

@Controller('auth/passkey')
export class WebAuthnController {
  constructor(private webAuthnService: WebAuthnService) {}

  @UseGuards(JwtAuthGuard)
  @Get('register/options')
  async generateRegistrationOptions(@Request() req) {
    return this.webAuthnService.generateRegistrationOptions(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async getPasskeys(@Request() req) {
    return this.webAuthnService.getPasskeys(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('register/verify')
  async verifyRegistration(@Request() req, @Body() body: WebAuthnVerifyDto) {
    return this.webAuthnService.verifyRegistration(req.user.userId, body);
  }

  @Post('login/options')
  @HttpCode(HttpStatus.OK)
  async generateAuthenticationOptions(
    @Body('phoneNumber') phoneNumber: string,
  ) {
    return this.webAuthnService.generateAuthenticationOptions(phoneNumber);
  }

  @Post('login/verify')
  @HttpCode(HttpStatus.OK)
  async verifyAuthentication(
    @Body('phoneNumber') phoneNumber: string,
    @Body() body: WebAuthnLoginVerifyDto,
  ) {
    return this.webAuthnService.verifyAuthentication(phoneNumber, body);
  }
}
