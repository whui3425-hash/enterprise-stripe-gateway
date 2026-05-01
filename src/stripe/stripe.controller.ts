import type { RawBodyRequest } from '@nestjs/common';
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { StripeService } from './stripe.service';

@Controller('stripe')
export class StripeController {
  constructor(private readonly stripeService: StripeService) {}

  @Post('checkout')
  async createCheckout(@Body() dto: CreateCheckoutDto) {
    return this.stripeService.createCheckoutSession(dto.userId, dto.priceId);
  }

  /** Stripe webhook 需读取 `req.rawBody`（参见 `main.ts` 中的 `rawBody: true`）供验签与压测链路复用原始字节序列。 */
  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') stripeSignature?: string,
  ) {
    if (!stripeSignature) {
      throw new UnauthorizedException('Missing Stripe-Signature header.');
    }
    return this.stripeService.handleWebhook(req.rawBody, stripeSignature);
  }
}
