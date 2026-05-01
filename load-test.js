import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 100,
  duration: '5s',
};

/** k6 WebhookPayload 必须与 Stripe checkout.session.completed 关键字段对齐，供服务端解析幂等键与 metadata.userId。 */
const FIXED_USER_UUID = '550e8400-e29b-41d4-a716-446655440001';

export default function () {
  const checkoutSessionCompleted = {
    id: 'evt_test_idempotency_999',
    object: 'event',
    api_version: '2023-10-16',
    created: 1710000000,
    livemode: false,
    pending_webhooks: 0,
    request: null,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_k6_session_001',
        object: 'checkout.session',
        amount_total: 1000,
        currency: 'usd',
        customer: 'cus_test_k6_customer',
        mode: 'subscription',
        metadata: {
          userId: FIXED_USER_UUID,
        },
        payment_status: 'paid',
        status: 'complete',
      },
    },
  };

  const payload = JSON.stringify(checkoutSessionCompleted);

  const res = http.post('http://localhost:3000/stripe/webhook', payload, {
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': 't=12345,v1=k6_load_test_signature',
    },
  });

  check(res, {
    'status is 200 or 201': (r) => r.status === 200 || r.status === 201,
  });
}
