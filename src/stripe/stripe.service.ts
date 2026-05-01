import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import Stripe from 'stripe';
import { Repository } from 'typeorm';
import { User } from '../database/entities/user.entity';

@Injectable()
export class StripeService {
  /** stripe 默认导出为可调用构造函数，类型需用 InstanceType 取实例类型 */
  private readonly stripe: InstanceType<typeof Stripe>;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly configService: ConfigService,
  ) {
    const secretKey = this.configService.getOrThrow<string>('STRIPE_SECRET_KEY');
    this.stripe = new Stripe(secretKey);
  }

  async createCheckoutSession(
    userId: string,
    priceId: string,
  ): Promise<{ url: string | null }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User not found: ${userId}`);
    }

    const successUrl =
      this.configService.get<string>('STRIPE_CHECKOUT_SUCCESS_URL') ??
      'http://localhost:3000/checkout/success?session_id={CHECKOUT_SESSION_ID}';
    const cancelUrl =
      this.configService.get<string>('STRIPE_CHECKOUT_CANCEL_URL') ??
      'http://localhost:3000/checkout/cancel';

    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userId,
      },
    });

    return { url: session.url };
  }
}
