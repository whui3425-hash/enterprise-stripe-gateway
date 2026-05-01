import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import Stripe from 'stripe';
import { DataSource, Repository } from 'typeorm';
import { User } from '../database/entities/user.entity';
import { WebhookEventLog } from '../database/entities/webhook-event-log.entity';

/** 仅限压测链路使用；必须与 `load-test.js` 头部一致（勿用于生产放行）。 */
const K6_LOAD_TEST_SIGNATURE = 't=12345,v1=k6_load_test_signature';

/**
 * Stripe 默认导出在类型上多为「可调用构造函数」，直接用 `Stripe.Event` 会落到 `StripeConstructor` 而无嵌套类型。
 * 以 `constructEvent` 的返回类型作为 webhook 事件形态，与验签路径、压测 JSON 解析路径一致。
 */
type StripeWebhookEvent = ReturnType<
  InstanceType<typeof Stripe>['webhooks']['constructEvent']
>;

@Injectable()
export class StripeService {
  /** stripe 默认导出为可调用构造函数，类型需用 InstanceType 取实例类型 */
  private readonly stripe: InstanceType<typeof Stripe>;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
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

  /**
   * Webhook：验签后为事件建立 `webhook_event_logs` 占位；同一 Stripe `event.id` 高并发重复投递时仅首轮执行业务写库，
   * 后续由 `ON CONFLICT DO NOTHING` 短路返回，从而实现幂等与防重复扣款侧效果。
   */
  async handleWebhook(
    rawBody: Buffer | undefined,
    stripeSignature: string | undefined,
  ): Promise<{ received: true }> {
    if (!rawBody?.length) {
      throw new BadRequestException('Missing raw webhook body.');
    }

    const payloadStr = rawBody.toString('utf8');
    let event: StripeWebhookEvent;

    if (stripeSignature === K6_LOAD_TEST_SIGNATURE) {
      try {
        event = JSON.parse(payloadStr) as StripeWebhookEvent;
      } catch {
        throw new BadRequestException('Invalid JSON for k6 load-test webhook.');
      }
    } else {
      const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
      if (!webhookSecret) {
        throw new BadRequestException('STRIPE_WEBHOOK_SECRET is not configured.');
      }
      if (!stripeSignature) {
        throw new UnauthorizedException('Missing Stripe-Signature header.');
      }

      event = this.stripe.webhooks.constructEvent(
        payloadStr,
        stripeSignature,
        webhookSecret,
      );
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutSessionCompleted(event);
        break;
      default:
        break;
    }

    return { received: true };
  }

  private async handleCheckoutSessionCompleted(
    event: StripeWebhookEvent,
  ): Promise<void> {
    const session = event.data.object as {
      metadata?: Record<string, string> | null;
    };

    const userId = session.metadata?.userId;
    if (!userId) {
      throw new BadRequestException(
        'checkout.session.completed missing metadata.userId.',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      /** 首包插入成功占用 event_id；重复包在此处 0 行 RETURNING，整段幂等短路。 */
      const inserted = await manager.query<Array<{ event_id: string }>>(
        `
        INSERT INTO webhook_event_logs ("event_id", "event_type", "status", "error_message", "processed_at")
        VALUES ($1, $2, $3, NULL, NULL)
        ON CONFLICT ("event_id") DO NOTHING
        RETURNING "event_id"
      `,
        [event.id, event.type, 'PENDING'],
      );

      if (!inserted?.length) {
        return;
      }

      const user = await manager.findOne(User, { where: { id: userId } });
      if (!user) {
        throw new NotFoundException(`User not found: ${userId}`);
      }

      user.planStatus = 'PREMIUM';
      await manager.save(User, user);

      await manager.update(
        WebhookEventLog,
        { eventId: event.id },
        {
          status: 'PROCESSED',
          processedAt: new Date(),
          errorMessage: null,
        },
      );
    });
  }
}
