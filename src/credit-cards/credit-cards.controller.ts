import {
  Controller,
  Post,
  Body,
  Get,
  Delete,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { CreditCardsService } from './credit-cards.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('credit-cards')
export class CreditCardsController {
  constructor(private readonly creditCardsService: CreditCardsService) {}

  @Post()
  create(
    @Request() req,
    @Body()
    body: {
      name: string;
      last4: string;
      closingDay: number;
      paymentDay: number;
    },
  ) {
    return this.creditCardsService.create(req.user.userId, body);
  }

  @Get()
  findAll(@Request() req) {
    return this.creditCardsService.findAll(req.user.userId);
  }

  @Delete(':id')
  remove(@Request() req, @Param('id') id: string) {
    return this.creditCardsService.remove(req.user.userId, id);
  }
}
