-- 本地/测试环境：插入几条用户，供 POST /stripe/checkout 使用（接口会校验 userId 必须存在）
-- 执行：psql 或任意 PG 客户端连上 stripe_gateway 后执行本文件
--   psql "postgresql://postgres:你的密码@主机:5432/stripe_gateway" -f scripts/seed-test-users.sql

INSERT INTO users (id, email, stripe_customer_id, plan_status, created_at, updated_at)
VALUES
  (
    '550e8400-e29b-41d4-a716-446655440001',
    'alpha@test.local',
    NULL,
    'FREE',
    NOW(),
    NOW()
  ),
  (
    '550e8400-e29b-41d4-a716-446655440002',
    'bravo@test.local',
    NULL,
    'FREE',
    NOW(),
    NOW()
  ),
  (
    '550e8400-e29b-41d4-a716-446655440003',
    'charlie@test.local',
    NULL,
    'FREE',
    NOW(),
    NOW()
  )
ON CONFLICT (email) DO NOTHING;

-- 可用 userId（与上行一一对应）：
--   550e8400-e29b-41d4-a716-446655440001
--   550e8400-e29b-41d4-a716-446655440002
--   550e8400-e29b-41d4-a716-446655440003
--
-- priceId：到 Stripe 测试模式 Dashboard → Products → 选价格，复制 price_xxx（与 .env 里 STRIPE_SECRET_KEY 同一环境）
