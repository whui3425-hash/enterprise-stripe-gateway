import { Body, Controller, Post } from '@nestjs/common';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { StripeService } from './stripe.service';

@Controller('stripe')
export class StripeController {
  constructor(private readonly stripeService: StripeService) {}

  @Post('checkout')
  async createCheckout(@Body() dto: CreateCheckoutDto) {
    return this.stripeService.createCheckoutSession(dto.userId, dto.priceId);
  }
}
